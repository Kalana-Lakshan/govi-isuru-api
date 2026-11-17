// Read-only backup: every collection to <out>/<collection>.json (MongoDB Extended JSON, restorable with
// mongoimport --jsonArray or scripts in this folder). Never writes to the database.
//   node scripts/db-backup.js [out-dir]
require('../src/config');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

(async () => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'backups'), stamp);
  fs.mkdirSync(out, { recursive: true });
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const summary = { database: db.databaseName, at: new Date().toISOString(), collections: {} };
  for (const { name } of await db.listCollections().toArray()) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(out, `${name}.json`), EJSON.stringify(docs, { relaxed: false }));
    summary.collections[name] = docs.length;
  }
  fs.writeFileSync(path.join(out, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`backed up ${Object.keys(summary.collections).length} collections to ${out}`);
  console.log(summary.collections);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('backup failed:', err.message);
  process.exit(1);
});
