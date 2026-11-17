// Crop suitability: FAO EcoCrop limiting-factor model in the AI service (/v1/suitability), with district
// climate from ERA5. The old hand-weighted rule scores are gone: they were not based on any data.
const express = require('express');
const ai = require('../services/aiClient');
const User = require('../models/User');
const districts = require('../utils/districts');

const router = express.Router();

const lower = (v) => (v === undefined || v === null || v === '' ? undefined : String(v).toLowerCase());
const numOrUndef = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));

const DRAINAGE = { poor: 'poor', moderate: 'moderate', good: 'good', excessive: 'excessive', 'well drained': 'good' };
const TEXTURE = { clay: 'clay', 'clay loam': 'clay_loam', clay_loam: 'clay_loam', loam: 'loam', 'sandy loam': 'sandy_loam',
  sandy_loam: 'sandy_loam', sandy: 'sandy', sand: 'sandy', organic: 'organic', peat: 'organic' };
const CROP_NAMES = { rice: 'Rice', tea: 'Tea', chili: 'Chili' };
const FACTOR_TEXT = {
  temperature_c: 'temperature', season_rainfall_mm: 'rainfall in the season', annual_rainfall_mm: 'annual rainfall',
  rainfall: 'rainfall', soil_ph: 'soil pH', drainage: 'drainage', texture: 'soil texture', altitude_m: 'altitude',
};

/**
 * POST /api/suitability/recommend
 * Body (camelCase from the web form, snake_case also accepted):
 *   district, season, soilPH|soil_ph, temperature|temperature_c, seasonRainfall|season_rainfall_mm,
 *   rainfall|annualRainfall|annual_rainfall_mm, irrigation|irrigated, drainage, soilType|texture, altitude|altitude_m
 */
function buildPayload(b = {}) {
  return {
    district: b.district ? districts.forClimate(b.district) : undefined,
    season: lower(b.season)?.startsWith('y') ? 'yala' : 'maha',
    soil_ph: numOrUndef(b.soil_ph ?? b.soilPH),
    temperature_c: numOrUndef(b.temperature_c ?? b.temperature),
    season_rainfall_mm: numOrUndef(b.season_rainfall_mm ?? b.seasonRainfall),
    // the web form's "Annual Rainfall (mm)" field is called `rainfall`
    annual_rainfall_mm: numOrUndef(b.annual_rainfall_mm ?? b.annualRainfall ?? b.rainfall),
    irrigated: Boolean(b.irrigated ?? b.irrigation ?? false),
    drainage: DRAINAGE[lower(b.drainage)] || undefined,
    texture: TEXTURE[lower(b.texture ?? b.soilType)] || undefined,
    altitude_m: numOrUndef(b.altitude_m ?? b.altitude),
  };
}

function present(out) {
  return {
    recommendations: out.ranking.map((r) => ({
      crop: CROP_NAMES[r.crop] || r.crop,
      score: Math.round(r.score * 100),
      class: r.class,
      class_name: r.class_name,
      limiting_factor: r.limiting_factor,
      reason: r.limiting_factor
        ? `${r.class_name}. Main limitation: ${FACTOR_TEXT[r.limiting_factor] || r.limiting_factor}.`
        : `${r.class_name}. No limiting factor for the given conditions.`,
      factors: r.factors,
      optimal_ranges: r.optimal_ranges,
    })),
    source: 'fao_ecocrop',
    method: out.method,
    inputs: out.inputs_used,
    data_source: out.source,
  };
}

// Mounted behind auth + checkCredits(20) in index.js; credits are refunded when no answer is given.
async function refund(req) {
  if (!req.user?.id) return;
  try {
    await User.updateOne({ _id: req.user.id }, { $inc: { credits: 20 } });
  } catch (err) {
    console.error('Credit refund failed:', err.message);
  }
}

router.post('/recommend', async (req, res) => {
  const payload = buildPayload(req.body || {});
  if (payload.soil_ph === undefined || (!payload.district && payload.temperature_c === undefined)) {
    await refund(req);
    return res.status(400).json({
      error: payload.soil_ph === undefined ? 'soil pH is required' : 'Choose a district, or enter temperature and rainfall',
    });
  }
  try {
    return res.json(present(await ai.suitability(payload)));
  } catch (err) {
    await refund(req);
    return res.status(err.status || 503).json({
      error: err.status === 404 ? 'Unknown district' : err.status === 422 ? 'Invalid input' : 'Suitability service unavailable',
      detail: err.body || err.message,
    });
  }
});

module.exports = router;
module.exports.buildPayload = buildPayload;
module.exports.present = present;
