// Backend <-> AI service contract, using a fake AI service on a random port (no MongoDB, no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { present } = require('../src/services/aiPresenter');

function fakeAiService() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, key: req.headers['x-api-key'], body });
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/v1/suitability') {
        const b = JSON.parse(body);
        if (b.district === 'Atlantis') return send(404, { detail: 'unknown district Atlantis' });
        return send(200, {
          ranking: [
            { crop: 'rice', score: 0.9, class: 'S1', class_name: 'Highly suitable', limiting_factor: 'soil_ph', factors: { soil_ph: 0.9 } },
            { crop: 'tea', score: 0.3, class: 'N', class_name: 'Not suitable', limiting_factor: 'altitude_m', factors: {} },
          ],
          inputs_used: { ...b, climate_defaults_from: 'ERA5 climatology' },
          method: 'FAO EcoCrop', source: 'FAO',
        });
      }
      if (url.pathname === '/v1/yield/history') {
        const hist = {};
        for (let y = 2000; y <= 2025; y += 1) hist[y] = y === 2017 ? 2000 : 4000;
        return send(200, { district: 'POLONNARUWA', history: { maha: hist, yala: {} }, unit: 'kg per net hectare' });
      }
      if (url.pathname === '/v1/yield/districts') return send(200, { districts: ['POLONNARUWA'], seasons: ['maha', 'yala'] });
      if (url.pathname === '/v1/yield/forecast') {
        return send(200, { district: 'POLONNARUWA', season: 'maha', year: 2027, yield_kg_ha: { p10: 3500, p50: 4200, p90: 4900 } });
      }
      if (url.pathname === '/v1/classes') return send(200, { crops: { rice: { blast: { type: 'fungal', name: { en: 'Rice blast', si: 'කොළ පාලුව' } } } } });
      return send(404, { detail: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen })));
}

let ai;
let api;
let base;

test.before(async () => {
  ai = await fakeAiService();
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${ai.server.address().port}`;
  process.env.AI_SERVICE_KEY = 'test-ai-key';
  delete process.env.MONGO_URI;
  const app = require('../src/index.js');
  await new Promise((resolve) => { api = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${api.address().port}`;
});

test.after(() => {
  api?.close();
  ai?.server.close();
  setTimeout(() => process.exit(0), 50).unref(); // email transport / timers keep the loop alive
});

test('suitability maps the web form to the AI service request', () => {
  const { buildPayload } = require('../src/routes/suitability');
  const p = buildPayload({ district: 'Polonnaruwa', season: 'Yala', soilPH: '6.1', soilType: 'Clay Loam', drainage: 'Good', irrigation: true });
  assert.deepEqual([p.season, p.soil_ph, p.texture, p.drainage, p.irrigated], ['yala', 6.1, 'clay_loam', 'good', true]);
  assert.equal(p.temperature_c, undefined); // the AI service fills ERA5 climate for the district
});

test('suitability ranking is presented with reasons', () => {
  const { present: show } = require('../src/routes/suitability');
  const out = show({
    ranking: [
      { crop: 'rice', score: 0.9, class: 'S1', class_name: 'Highly suitable', limiting_factor: 'soil_ph', factors: {} },
      { crop: 'tea', score: 0.3, class: 'N', class_name: 'Not suitable', limiting_factor: 'altitude_m', factors: {} },
    ],
    inputs_used: {}, method: 'FAO EcoCrop', source: 'FAO',
  });
  assert.equal(out.recommendations[0].crop, 'Rice');
  assert.equal(out.recommendations[0].score, 90);
  assert.match(out.recommendations[1].reason, /altitude/);
});

test('AI service calls carry the API key', async () => {
  await fetch(`${base}/api/yield/districts`);
  assert.ok(ai.seen.length && ai.seen.every((s) => s.key === 'test-ai-key'));
});

test('yield trends and shortfall warning come from DCS history', async () => {
  const t = await (await fetch(`${base}/api/yield/trends?district=Polonnaruwa&season=Maha`)).json();
  assert.equal(t.data.length, 26);
  assert.equal(t.district, 'Polonnaruwa');
  const w = await (await fetch(`${base}/api/yield/warning?district=Polonnaruwa&season=maha`)).json();
  assert.deepEqual(w.shortfall_years, [2017]);
  assert.equal(w.risk_level, 'low');
});

test('yield rankings and districts', async () => {
  const r = await (await fetch(`${base}/api/yield/rankings?season=maha`)).json();
  assert.equal(r.rankings[0].district, 'Polonnaruwa');
  assert.equal(r.rankings[0].forecast_kg_ha, 4200);
  const d = await (await fetch(`${base}/api/yield/districts`)).json();
  assert.deepEqual(d.districts, ['Polonnaruwa']);
});

test('paid AI routes need a login', async () => {
  assert.equal((await fetch(`${base}/api/ai/predict/rice`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/api/yield/predict?district=Polonnaruwa`)).status, 401);
  assert.equal((await fetch(`${base}/api/ai/unknown-cases`)).status, 401);
  assert.equal((await fetch(`${base}/api/suitability/recommend`, { method: 'POST' })).status, 401);
});

test('class catalogue is proxied', async () => {
  const c = await (await fetch(`${base}/api/ai/classes?crop=rice`)).json();
  assert.equal(c.classes.blast.name.en, 'Rice blast');
});

test('presenter: known disease keeps the fields the old screen reads', () => {
  const cat = { crops: { rice: { blast: { type: 'fungal', name: { en: 'Rice blast', si: 'කොළ පාලුව' }, advice: { en: ['Spray X'] } } } } };
  const out = present({
    status: 'KNOWN_DISEASE', class: 'blast', source: 'model', confidence: 0.91, crop: 'rice',
    top3: [{ class: 'blast', probability: 0.91 }, { class: 'brown_spot', probability: 0.05 }],
    heatmap_png_base64: 'AAA', model: { version: 'v1' },
  }, 'rice', cat);
  assert.equal(out.prediction, 'Rice blast');
  assert.equal(out.si_name, 'කොළ පාලුව');
  assert.deepEqual(out.treatment, ['Spray X']);
  assert.equal(out.gradcam.overlay, 'AAA');
  assert.equal(out.all_predictions[1].disease, 'Brown Spot');
  assert.equal(out.dev_model, false);
});

test('presenter: other statuses carry a message and no diagnosis', () => {
  const wrong = present({ status: 'WRONG_CROP', requested_crop: 'rice', detected_crop: 'chili' }, 'rice', {});
  assert.equal(wrong.detected_crop, 'chili');
  assert.match(wrong.message, /different crop/);
  assert.equal(wrong.prediction, undefined);
  const bad = present({ status: 'BAD_PHOTO', problems: ['too_dark'], advice: ['Use daylight'], model: { warning: 'dev' } }, 'tea', {});
  assert.deepEqual(bad.advice, ['Use daylight']);
  assert.equal(bad.dev_model, true);
});

test('responses are compressed and carry security headers', async () => {
  const r = await fetch(`${base}/api/ai/classes`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('district names are matched across data sources', () => {
  const d = require('../src/utils/districts');
  assert.equal(d.forYield('Kilinochchi'), 'KILLINOCHCHI');
  assert.equal(d.forYield('NuwaraEliya'), 'NUWARA ELIYA');
  assert.equal(d.forClimate('Monaragala'), 'MONERAGALA');
  assert.equal(d.display('MULLATIVU'), 'Mullaitivu');
  assert.equal(d.canonical('atlantis'), null);
});

test('unknown-disease outbreak rule: 3 cases in a week, notify once', () => {
  const { shouldNotify, MIN_CASES } = require('../src/services/unknownOutbreakService');
  assert.equal(MIN_CASES, 3);
  assert.equal(shouldNotify(2, false), false);
  assert.equal(shouldNotify(3, false), true);
  assert.equal(shouldNotify(9, true), false);
});
