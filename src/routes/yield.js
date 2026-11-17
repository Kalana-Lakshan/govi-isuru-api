// Paddy yield: forecasts and history from official Department of Census and Statistics data, served by the
// AI service (/v1/yield/*). Replaces the old hard-coded mock numbers.
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const checkCredits = require('../middleware/creditMiddleware');
const ai = require('../services/aiClient');
const User = require('../models/User');

const router = express.Router();

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const season = (s) => (String(s || 'maha').toLowerCase().startsWith('y') ? 'yala' : 'maha');
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

async function refund(userId, amount) {
  try {
    await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
  } catch (err) {
    console.error('Credit refund failed:', err.message);
  }
}

function fail(res, err) {
  return res.status(err.status || 503).json({
    success: false,
    error: err.status === 404 ? 'No official data for this district/season' : 'Yield service unavailable',
    detail: err.message,
  });
}

// History changes only with a new DCS release: cache per district for 6 hours.
const historyCache = new Map();
async function history(district) {
  const key = district.toUpperCase();
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data;
  const data = await ai.yieldHistory({ district });
  historyCache.set(key, { at: Date.now(), data });
  return data;
}

function series(hist, s) {
  return Object.entries(hist.history?.[s] || {})
    .map(([year, v]) => ({ year: Number(year), yield_kg_ha: v }))
    .filter((r) => Number.isFinite(r.yield_kg_ha))
    .sort((a, b) => a.year - b.year);
}

/** Seasons whose yield fell >15 % below the previous 5-season mean (pure; tested). */
function shortfallRisk(data) {
  let checked = 0;
  const years = [];
  for (let i = 5; i < data.length; i += 1) {
    const mean = data.slice(i - 5, i).reduce((a, r) => a + r.yield_kg_ha, 0) / 5;
    checked += 1;
    if (data[i].yield_kg_ha < 0.85 * mean) years.push(data[i].year);
  }
  const risk = checked ? years.length / checked : 0;
  return { checked, years, risk, level: risk >= 0.25 ? 'high' : risk >= 0.1 ? 'medium' : 'low' };
}

/** GET /api/yield/districts */
router.get('/districts', async (req, res) => {
  try {
    const d = await ai.yieldDistricts();
    res.json({ ...d, districts: d.districts.map(titleCase) });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/yield/predict?district=&season=maha|yala&area_ha= (20 credits, refunded on failure) */
router.get('/predict', authMiddleware, checkCredits(20), async (req, res) => {
  const district = String(req.query.district || '').trim();
  const s = season(req.query.season);
  const area = num(req.query.area_ha, 1);
  if (!district) {
    await refund(req.user.id, 20);
    return res.status(400).json({ success: false, error: 'district is required' });
  }
  try {
    const f = await ai.yieldForecast({ district, season: s, area_ha: area });
    const y = f.yield_kg_ha;
    const harvest = f.expected_harvest_kg || {};
    const p50kg = harvest.p50 ?? Math.round(y.p50 * area);
    return res.json({
      success: true,
      district: titleCase(f.district || district),
      season: s,
      year: f.year,
      area_ha: area,
      // fields read by the original screen
      predicted_yield: Number((p50kg / 1000).toFixed(2)), // tonnes for the whole area
      yield_kg_ha: y.p50,
      total_production_kg: p50kg,
      unit: 'metric tons',
      yield_range: { min: y.p10, max: y.p90 },
      // full information
      forecast: { yield_kg_ha: y, expected_harvest_kg: harvest, interval: f.interval || '80 %' },
      method: f.method,
      based_on_years: f.based_on_years,
      last_observed: f.last_observed,
      source: f.source,
    });
  } catch (err) {
    await refund(req.user.id, 20);
    return fail(res, err);
  }
});

/** GET /api/yield/profit?district=&season=&area_ha=&cost_per_ha=&price_per_kg= (10 credits)
 *  Profit range from the forecast's 80 % yield interval and the farmer's own cost and price. */
router.get('/profit', authMiddleware, checkCredits(10), async (req, res) => {
  const district = String(req.query.district || '').trim();
  const s = season(req.query.season);
  const area = num(req.query.area_ha, 1);
  const costPerHa = num(req.query.cost_per_ha, 0);
  const price = num(req.query.price_per_kg, 0);
  if (!district || !price) {
    await refund(req.user.id, 10);
    return res.status(400).json({ success: false, error: 'district and price_per_kg are required' });
  }
  try {
    const f = await ai.yieldForecast({ district, season: s, area_ha: area });
    const totalCost = costPerHa * area;
    const at = (q) => {
      const kg = f.yield_kg_ha[q] * area;
      return { harvest_kg: Math.round(kg), revenue: Math.round(kg * price), profit: Math.round(kg * price - totalCost) };
    };
    const mid = at('p50');
    return res.json({
      success: true,
      district: titleCase(district), season: s, year: f.year, area_ha: area,
      price_per_kg: price, cost_per_ha: costPerHa, total_cost: totalCost,
      estimated_profit: mid.profit,
      revenue: mid.revenue,
      roi: totalCost ? Number(((mid.profit / totalCost) * 100).toFixed(1)) : null,
      profit_per_ha: area ? Math.round(mid.profit / area) : null,
      break_even_yield: Math.round(costPerHa / price), // kg/ha needed to cover costs
      range: { low: at('p10'), expected: mid, high: at('p90') },
      source: f.source,
    });
  } catch (err) {
    await refund(req.user.id, 10);
    return fail(res, err);
  }
});

/** GET /api/yield/trends?district=&season= : observed yields per year (DCS). */
router.get('/trends', async (req, res) => {
  const district = String(req.query.district || '').trim();
  if (!district) return res.status(400).json({ success: false, error: 'district is required' });
  try {
    const s = season(req.query.season);
    const h = await history(district);
    const data = series(h, s);
    const label = s === 'maha' ? 'Maha' : 'Yala';
    res.json({
      success: true, district: titleCase(district), season: s, unit: h.unit, data,
      // shape read by the web app's trend list (newest first)
      trends: data.slice(-15).reverse().map((r) => ({ year: r.year, season: label, avg_yield_kg_ha: r.yield_kg_ha })),
    });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/yield/warning?district=&season= : historical risk of a sharp yield drop. */
router.get('/warning', async (req, res) => {
  const district = String(req.query.district || '').trim();
  if (!district) return res.status(400).json({ success: false, error: 'district is required' });
  try {
    const s = season(req.query.season);
    const r = shortfallRisk(series(await history(district), s).slice(-25));
    res.json({
      success: true,
      district: titleCase(district), season: s,
      risk_score: Number(r.risk.toFixed(2)),
      risk_level: r.level,
      basis: `Share of the last ${r.checked} seasons whose yield fell more than 15 % below the previous 5-season mean`,
      shortfall_years: r.years,
      warnings: r.years.length ? [{
        message: `Sharp yield drops (more than 15 % below the 5-season average) happened in ${r.years.join(', ')}.`,
      }] : [],
      recommendations: r.level === 'low' ? [] : [{
        en: 'Yields here have dropped sharply in some seasons. Keep a reserve for inputs and follow weather and pest alerts.',
      }],
    });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/yield/rankings?season= : districts ranked by forecast median yield, with year-to-year stability. */
router.get('/rankings', async (req, res) => {
  try {
    const s = season(req.query.season);
    const { districts } = await ai.yieldDistricts();
    const rows = await Promise.all(districts.map(async (d) => {
      try {
        const [f, h] = await Promise.all([ai.yieldForecast({ district: d, season: s }), history(d)]);
        const last10 = series(h, s).slice(-10).map((r) => r.yield_kg_ha);
        const mean = last10.reduce((a, b) => a + b, 0) / (last10.length || 1);
        const sd = Math.sqrt(last10.reduce((a, b) => a + (b - mean) ** 2, 0) / (last10.length || 1));
        return {
          district: titleCase(d),
          forecast_kg_ha: f.yield_kg_ha.p50,
          range_kg_ha: [f.yield_kg_ha.p10, f.yield_kg_ha.p90],
          avg_yield: Math.round(mean),
          // change of the last 5 seasons' mean vs the 5 before (fraction)
          trend: last10.length === 10
            ? Number((last10.slice(5).reduce((a, b) => a + b, 0) / last10.slice(0, 5).reduce((a, b) => a + b, 0) - 1).toFixed(3))
            : null,
          stability: mean ? Number((1 - sd / mean).toFixed(3)) : null,
        };
      } catch {
        return null;
      }
    }));
    const rankings = rows.filter(Boolean).sort((a, b) => b.forecast_kg_ha - a.forecast_kg_ha)
      .map((r, i, all) => ({ rank: i + 1, ...r, overall_score: Math.round((100 * r.forecast_kg_ha) / all[0].forecast_kg_ha) }));
    res.json({ success: true, season: s, rankings, source: 'Department of Census and Statistics, Sri Lanka' });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
module.exports.shortfallRisk = shortfallRisk;
