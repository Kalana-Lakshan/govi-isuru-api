// Read-only overview of the database the API is configured for: collections, document counts,
// user roles, and fields the v2 code relies on. Never writes. Prints no personal data or secrets.
//   node scripts/db-inspect.js
require('../src/config');
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log('database:', db.databaseName);
  const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
  for (const name of cols) {
    console.log(`  ${name.padEnd(28)} ${await db.collection(name).estimatedDocumentCount()}`);
  }
  if (cols.includes('users')) {
    const users = db.collection('users');
    const roles = await users.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]).toArray();
    console.log('users by role:', Object.fromEntries(roles.map((r) => [r._id ?? '(none)', r.n])));
    const checks = {
      'missing district': { district: { $in: [null, ''] } },
      'missing credits': { credits: { $exists: false } },
      'officers not approved': { role: 'officer', isApproved: { $ne: true } },
      'email not verified': { isEmailVerified: { $ne: true } },
    };
    for (const [label, q] of Object.entries(checks)) console.log(`  ${label}: ${await users.countDocuments(q)}`);
    const admin = await users.countDocuments({ email: (process.env.ADMIN_EMAIL || '').toLowerCase(), role: 'admin' });
    console.log('ADMIN_EMAIL already an admin:', admin > 0);
  }
  if (cols.includes('listings')) {
    const local = await db.collection('listings').countDocuments({ images: { $elemMatch: { $regex: '^/uploads/' } } });
    console.log('listings with images on the old server disk:', local);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('inspection failed:', err.message);
  process.exit(1);
});
