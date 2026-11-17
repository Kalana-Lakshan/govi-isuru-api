// Thin client for the Govi Isuru AI service (repo govi-isuru-ai-service, docs/INTEGRATION.md).
// Only the backend talks to it; browsers never see the AI service key.
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

const http = axios.create({
  baseURL: config.AI_SERVICE_URL,
  timeout: config.AI_TIMEOUT_MS,
  headers: config.AI_SERVICE_KEY ? { 'X-API-Key': config.AI_SERVICE_KEY } : {},
});

class AiServiceError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status; // HTTP status to return to our client
    this.body = body;
  }
}

async function call(fn) {
  try {
    const res = await fn();
    return res.data;
  } catch (err) {
    if (err.response) {
      const detail = err.response.data?.detail || err.response.data;
      // 4xx from the AI service are input problems; anything else is our upstream failing.
      const status = err.response.status < 500 ? err.response.status : 502;
      throw new AiServiceError(typeof detail === 'string' ? detail : 'AI service rejected the request', status, detail);
    }
    throw new AiServiceError('AI service unavailable', 503);
  }
}

module.exports = {
  AiServiceError,

  predictDisease(buffer, { filename = 'leaf.jpg', contentType = 'image/jpeg', crop, heatmap = true } = {}) {
    const form = new FormData();
    form.append('file', buffer, { filename, contentType });
    return call(() => http.post('/v1/disease/predict', form, {
      params: { ...(crop ? { crop } : {}), heatmap },
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    }));
  },
  classes: (crop) => call(() => http.get('/v1/classes', { params: crop ? { crop } : {} })),
  metadata: () => call(() => http.get('/v1/metadata')),
  clusterUnknowns: (body) => call(() => http.post('/v1/disease/unknowns/cluster', body)),
  addPrototype: (body) => call(() => http.post('/v1/disease/prototypes', body)),
  yieldDistricts: () => call(() => http.get('/v1/yield/districts')),
  yieldForecast: (params) => call(() => http.get('/v1/yield/forecast', { params })),
  yieldHistory: (params) => call(() => http.get('/v1/yield/history', { params })),
  suitability: (body) => call(() => http.post('/v1/suitability', body)),
  health: () => call(() => http.get('/ready', { timeout: 3000 })),
};
