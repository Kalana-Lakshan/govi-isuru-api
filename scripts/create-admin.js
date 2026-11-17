// Create the first administrator from ADMIN_EMAIL (or promote an existing account with that email).
// The password is random and never shown: the person sets their own with "Forgot password" on the website.
//   node scripts/create-admin.js            (uses ADMIN_EMAIL from .env)
//   node scripts/create-admin.js --dry-run  (only says what it would do)
require('../src/config');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email address');
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === 'admin') {
      console.log('That email is already an administrator; nothing to do.');
    } else if (dryRun) {
      console.log(`Would promote the existing ${existing.role} account to admin.`);
    } else {
      await User.updateOne({ _id: existing._id }, { $set: { role: 'admin', isApproved: true, approvalStatus: 'approved' } });
      console.log(`Promoted the existing ${existing.role} account to admin.`);
    }
  } else {
    let username = email.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'admin';
    if (await User.exists({ username })) username = `${username}-admin`;
    if (dryRun) {
      console.log(`Would create admin "${username}".`);
    } else {
      await User.create({
        username,
        fullName: 'Govi Isuru Administrator',
        email,
        password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
        district: 'Colombo',
        dsDivision: 'Colombo',
        gnDivision: 'Colombo',
        role: 'admin',
        isApproved: true,
        approvalStatus: 'approved',
        isEmailVerified: true,
      });
      console.log(`Created admin "${username}". Set the password with "Forgot password" on the sign-in page.`);
    }
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('create-admin failed:', err.message);
  process.exit(1);
});
