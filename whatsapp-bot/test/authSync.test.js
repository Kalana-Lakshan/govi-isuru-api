const assert = require('node:assert');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Replace the backend client with an in-memory store before authSync loads it.
const store = {};
const apiPath = require.resolve('../src/api');
require.cache[apiPath] = {
  id: apiPath, filename: apiPath, loaded: true,
  exports: {
    getAuthState: async (name) => ({ files: store[name] || {} }),
    setAuthState: async (name, files) => { store[name] = files; return { saved: Object.keys(files).length }; },
  },
};
process.env.BOT_AUTH_SYNC_DELAY_MS = '10';
const authSync = require('../src/authSync');
const quiet = { info() {}, warn() {} };

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bot-auth-'));

test('a key change is backed up and restored into an empty folder', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'creds.json'), '{"me":1}');
  fs.writeFileSync(path.join(dir, 'pre-key-1.json'), '{"k":2}');
  const keys = { get: async () => ({}), set: async () => {} };
  const { state, saveCreds } = authSync.withBackup({ creds: {}, keys }, async () => {}, dir, quiet);
  await state.keys.set({ 'pre-key': {} });
  await saveCreds();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepStrictEqual(Object.keys(store.default).sort(), ['creds.json', 'pre-key-1.json']);

  const fresh = tmp();
  assert.strictEqual(await authSync.restore(fresh, quiet), 2);
  assert.strictEqual(fs.readFileSync(path.join(fresh, 'creds.json'), 'utf8'), '{"me":1}');
});

test('restore leaves an existing session alone and refuses unsafe file names', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'creds.json'), '{"local":true}');
  assert.strictEqual(await authSync.restore(dir, quiet), 0);

  store.default = { 'creds.json': '{}', '../escape.json': '{}' };
  const fresh = tmp();
  assert.strictEqual(await authSync.restore(fresh, quiet), 1);
  assert.ok(!fs.existsSync(path.join(fresh, '..', 'escape.json')));
});
