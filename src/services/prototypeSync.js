// Officer-confirmed new diseases are registered in the AI service's memory (/v1/disease/prototypes).
// On hosting without a persistent disk (Render free) the AI service forgets them when it restarts, so this
// API re-registers every confirmed disease from MongoDB (UnknownCase.status = "confirmed") whenever the AI
// service no longer lists it. Runs at start-up and every few minutes; cheap when nothing is missing.
const ai = require('./aiClient');
const UnknownCase = require('../models/UnknownCase');

const INTERVAL_MS = Number(process.env.PROTOTYPE_SYNC_MINUTES || 5) * 60 * 1000;

async function confirmedDiseases() {
  return UnknownCase.aggregate([
    { $match: { status: 'confirmed', confirmedLabel: { $ne: '' } } },
    { $group: { _id: { crop: '$crop', label: '$confirmedLabel' }, embeddings: { $push: '$embedding' } } },
  ]);
}

/** Register confirmed diseases the AI service is missing. Returns what was (re)registered. */
async function syncOfficerPrototypes(logger = console) {
  const groups = await confirmedDiseases();
  if (!groups.length) return [];
  const meta = await ai.metadata();
  const registered = [];
  for (const g of groups) {
    const { crop, label } = g._id;
    const known = meta.crops?.[crop]?.officer_classes || [];
    if (known.includes(label)) continue;
    await ai.addPrototype({ crop, label, embeddings_f16_base64: g.embeddings });
    registered.push(`${crop}/${label}`);
  }
  if (registered.length) logger.log(`Re-registered officer-confirmed diseases in the AI service: ${registered.join(', ')}`);
  return registered;
}

function startPrototypeSync(logger = console) {
  const run = () => syncOfficerPrototypes(logger)
    .catch((err) => logger.warn(`Officer disease sync skipped: ${err.message}`));
  setTimeout(run, 15 * 1000).unref();
  setInterval(run, INTERVAL_MS).unref();
}

module.exports = { syncOfficerPrototypes, startPrototypeSync };
