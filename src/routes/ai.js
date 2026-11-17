// AI Doctor: proxies leaf photos to the AI service, adds class information, stores unknown cases for officers.
const express = require('express');
const multer = require('multer');

const authMiddleware = require('../middleware/authMiddleware');
const checkCredits = require('../middleware/creditMiddleware');
const ai = require('../services/aiClient');
const User = require('../models/User');
const UnknownCase = require('../models/UnknownCase');
const imageStore = require('../services/imageStore');
const { present } = require('../services/aiPresenter');
const { checkUnknownOutbreak } = require('../services/unknownOutbreakService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

const CROPS = new Set(['rice', 'tea', 'chili']);
const PREDICT_COST = 25;
// The farmer is not charged when no diagnosis could be made.
const REFUND_STATUSES = new Set(['BAD_PHOTO', 'NOT_A_PLANT', 'UNSUPPORTED_PLANT', 'WRONG_CROP']);

function requireOfficer(req, res, next) {
  if (req.user?.role === 'officer' || req.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'Officer access required' });
}

async function refund(userId, amount) {
  try {
    await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
  } catch (err) {
    console.error('Credit refund failed:', err.message);
  }
}

// Class catalogue (names/advice) changes only when the AI bundle changes: cache it for 10 minutes.
let classCache = { at: 0, data: null };
async function classCatalogue() {
  if (classCache.data && Date.now() - classCache.at < 10 * 60 * 1000) return classCache.data;
  try {
    classCache = { at: Date.now(), data: await ai.classes() };
  } catch {
    classCache = { at: Date.now() - 9 * 60 * 1000, data: classCache.data || { crops: {} } }; // retry in 1 min
  }
  return classCache.data;
}

/** POST /api/ai/predict/:crop  (multipart field `file`). 25 credits, refunded when no diagnosis is possible. */
async function predict(req, res) {
  const crop = String(req.params.crop || req.query.crop || '').toLowerCase() || undefined;
  if (crop && !CROPS.has(crop)) return res.status(400).json({ error: 'Invalid crop type' });
  if (!req.file) return res.status(400).json({ error: 'No image file provided (JPEG, PNG or WebP)' });

  let result;
  try {
    result = await ai.predictDisease(req.file.buffer, {
      filename: req.file.originalname, contentType: req.file.mimetype, crop, heatmap: true,
    });
  } catch (err) {
    await refund(req.user.id, PREDICT_COST);
    const status = err.status || 503;
    return res.status(status).json({
      error: status === 503 ? 'AI service unavailable' : 'Diagnosis failed',
      msg: status === 503 ? 'The AI doctor is temporarily unavailable. Please try again shortly.' : err.message,
    });
  }

  const refunded = REFUND_STATUSES.has(result.status);
  if (refunded) await refund(req.user.id, PREDICT_COST);
  const body = present(result, crop, await classCatalogue());
  body.credits_refunded = refunded;

  if (result.status === 'UNKNOWN_DISEASE' && result.embedding_f16_base64) {
    try {
      const imagePath = await imageStore.saveImage(req.file.buffer, 'unknown', 'case', req.file.mimetype);
      const user = await User.findById(req.user.id).select('district').lean();
      const doc = await UnknownCase.create({
        user: req.user.id,
        crop: result.crop || crop,
        district: req.body?.district || user?.district || '',
        imagePath,
        embedding: result.embedding_f16_base64,
        nearestKnown: result.novelty?.nearest_prototype || '',
        modelVersion: result.model?.version,
      });
      body.case_id = doc._id;
      checkUnknownOutbreak({ crop: doc.crop, district: doc.district })
        .catch((err) => console.error('Outbreak check failed:', err.message));
    } catch (err) {
      console.error('Could not store unknown case:', err.message);
    }
  }
  return res.json(body);
}

router.post('/predict/:crop', authMiddleware, checkCredits(PREDICT_COST), upload.single('file'), predict);
router.post('/predict', authMiddleware, checkCredits(PREDICT_COST), upload.single('file'), predict);

/** GET /api/ai/classes?crop=rice : disease names (en/si/ta), type and advice. */
router.get('/classes', async (req, res) => {
  const cat = await classCatalogue();
  const crop = req.query.crop;
  if (crop) return res.json({ crop, classes: cat.crops?.[crop] || {} });
  return res.json(cat);
});

/** GET /api/ai/status : is the AI service up, and is it a trained model? */
router.get('/status', async (req, res) => {
  try {
    const meta = await ai.metadata();
    res.json({
      available: true,
      version: meta.model?.version || meta.version || null,
      dev_model: Boolean(meta.model?.warning || meta.warning),
    });
  } catch {
    res.json({ available: false });
  }
});

// ---------------------------------------------------------------- officer review of unknown diseases

/** GET /api/ai/unknown-cases?crop=&status=pending&district=&limit= */
router.get('/unknown-cases', authMiddleware, requireOfficer, async (req, res) => {
  const q = { status: String(req.query.status || 'pending') };
  if (req.query.crop) q.crop = String(req.query.crop);
  if (req.query.district) q.district = String(req.query.district);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const cases = await UnknownCase.find(q).sort({ createdAt: -1 }).limit(limit)
    .select('-embedding').populate('user', 'username district').lean();
  res.json({ cases });
});

/** POST /api/ai/unknown-cases/cluster {crop, district?, threshold?, min_size?}: group similar pending cases. */
router.post('/unknown-cases/cluster', authMiddleware, requireOfficer, async (req, res) => {
  const { crop, district, threshold = 0.8, min_size = 3 } = req.body || {};
  if (!CROPS.has(crop)) return res.status(400).json({ error: 'crop must be rice, tea or chili' });
  const q = { crop, status: 'pending' };
  if (district) q.district = String(district);
  const cases = await UnknownCase.find(q).sort({ createdAt: -1 }).limit(2000).lean();
  if (!cases.length) return res.json({ groups: [], ungrouped_ids: [] });
  try {
    const out = await ai.clusterUnknowns({
      crop, threshold, min_size,
      cases: cases.map((c) => ({ id: String(c._id), embedding_f16_base64: c.embedding })),
    });
    const byId = Object.fromEntries(cases.map((c) => [String(c._id), c]));
    const view = (id) => ({
      id, imagePath: byId[id]?.imagePath, district: byId[id]?.district, createdAt: byId[id]?.createdAt,
    });
    res.json({
      ...out,
      groups: (out.groups || []).map((g) => {
        const ids = g.member_ids || g.members || [];
        return {
          ...g,
          representative: view(g.representative_id),
          members: ids.map(view),
          districts: [...new Set(ids.map((id) => byId[id]?.district).filter(Boolean))],
        };
      }),
    });
  } catch (err) {
    res.status(err.status || 503).json({ error: err.message });
  }
});

/** POST /api/ai/unknown-cases/confirm {crop, label, caseIds[]}: register a new disease from confirmed cases. */
router.post('/unknown-cases/confirm', authMiddleware, requireOfficer, async (req, res) => {
  const { crop, label, caseIds } = req.body || {};
  if (!CROPS.has(crop)) return res.status(400).json({ error: 'crop must be rice, tea or chili' });
  if (!/^[a-z][a-z0-9_]{2,60}$/.test(label || '')) {
    return res.status(400).json({ error: 'label must be a snake_case id, e.g. rice_false_smut' });
  }
  if (!Array.isArray(caseIds) || !caseIds.length) return res.status(400).json({ error: 'caseIds required' });
  const cases = await UnknownCase.find({ _id: { $in: caseIds }, crop }).lean();
  if (!cases.length) return res.status(404).json({ error: 'No matching cases' });
  try {
    const out = await ai.addPrototype({ crop, label, embeddings_f16_base64: cases.map((c) => c.embedding) });
    await UnknownCase.updateMany({ _id: { $in: cases.map((c) => c._id) } },
      { $set: { status: 'confirmed', confirmedLabel: label, reviewedBy: req.user.id, reviewedAt: new Date() } });
    classCache.at = 0;
    res.json({ registered: label, cases: cases.length, ai: out });
  } catch (err) {
    res.status(err.status || 503).json({ error: err.message });
  }
});

/** POST /api/ai/unknown-cases/dismiss {caseIds[]}: not a disease (e.g. insect damage, bad photo). */
router.post('/unknown-cases/dismiss', authMiddleware, requireOfficer, async (req, res) => {
  const { caseIds } = req.body || {};
  if (!Array.isArray(caseIds) || !caseIds.length) return res.status(400).json({ error: 'caseIds required' });
  const r = await UnknownCase.updateMany({ _id: { $in: caseIds }, status: 'pending' },
    { $set: { status: 'dismissed', reviewedBy: req.user.id, reviewedAt: new Date() } });
  res.json({ dismissed: r.modifiedCount });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
