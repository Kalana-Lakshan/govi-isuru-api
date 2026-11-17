// Keeps a copy of the Baileys auth folder in the backend (MongoDB), so the bot survives restarts on
// hosting without a persistent disk. Restore once at start-up; upload (debounced) after every change.
const fs = require('fs');
const path = require('path');
const api = require('./api');

const NAME = process.env.BOT_AUTH_NAME || 'default';
const UPLOAD_DELAY_MS = Number(process.env.BOT_AUTH_SYNC_DELAY_MS || 5000);

let timer = null;
let uploading = Promise.resolve();

function readFolder(dir) {
  const files = {};
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isFile() && name.endsWith('.json')) files[name] = fs.readFileSync(p, 'utf8');
  }
  return files;
}

/** Write the stored copy into `dir` when the folder has no credentials yet. Returns the file count. */
async function restore(dir, logger = console) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'creds.json'))) return 0;
  try {
    const { files = {} } = await api.getAuthState(NAME);
    let n = 0;
    for (const [name, content] of Object.entries(files)) {
      if (!/^[\w.@:-]+\.json$/.test(name)) continue; // never write outside the folder
      fs.writeFileSync(path.join(dir, name), content);
      n += 1;
    }
    if (n) logger.info({ files: n }, 'Restored WhatsApp session from the backend');
    return n;
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not restore the WhatsApp session; a QR pairing may be needed');
    return 0;
  }
}

/** Upload the folder a few seconds after the last change (Baileys writes many small key files). */
function scheduleUpload(dir, logger = console) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    uploading = uploading.then(async () => {
      try {
        await api.setAuthState(NAME, readFolder(dir));
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not back up the WhatsApp session');
      }
    });
  }, UPLOAD_DELAY_MS);
  if (timer.unref) timer.unref();
}

/** Wrap Baileys' auth state so every credential or key change triggers a backup. */
function withBackup(authState, saveCreds, dir, logger = console) {
  const keys = authState.keys;
  const wrappedKeys = {
    ...keys,
    get: (...a) => keys.get(...a),
    set: async (...a) => {
      const r = await keys.set(...a);
      scheduleUpload(dir, logger);
      return r;
    },
  };
  const wrappedSave = async () => {
    await saveCreds();
    scheduleUpload(dir, logger);
  };
  return { state: { ...authState, keys: wrappedKeys }, saveCreds: wrappedSave };
}

module.exports = { restore, scheduleUpload, withBackup, readFolder };
