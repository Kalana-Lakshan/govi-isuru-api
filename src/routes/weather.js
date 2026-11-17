const express = require('express');
const axios = require('axios');

const TtlCache = require('../utils/ttlCache');

const router = express.Router();

// OpenWeatherMap's free tier is rate limited: share answers between users of the same area.
// Coordinates are rounded to ~1 km so nearby farmers hit the same cache entry.
const cache = new TtlCache({ ttlMs: 10 * 60 * 1000, max: 2000 });
const TTL = { geocode: 24 * 3600 * 1000, current: 10 * 60 * 1000, forecast: 30 * 60 * 1000 };
const round = (v) => Number(v).toFixed(2);

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

function requireApiKey(res) {
  if (!WEATHER_API_KEY) {
    res.status(500).json({ error: 'WEATHER_API_KEY not set in environment' });
    return true;
  }
  return false;
}

router.get('/geocode', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  if (requireApiKey(res)) return;

  try {
    const data = await cache.wrap(`geocode:${String(query).trim().toLowerCase()}`, async () => (await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
      params: {
        q: query,
        limit: 1,
        appid: WEATHER_API_KEY,
      },
      timeout: 8000,
    })).data, TTL.geocode);

    res.set('Cache-Control', 'public, max-age=300');
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch geocode data' });
  }
});

router.get('/current', async (req, res) => {
  const { lat, lon, units = 'metric' } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  if (requireApiKey(res)) return;

  try {
    const data = await cache.wrap(`current:${round(lat)}:${round(lon)}:${units}`, async () => (await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        lat,
        lon,
        units,
        appid: WEATHER_API_KEY,
      },
      timeout: 8000,
    })).data, TTL.current);

    res.set('Cache-Control', 'public, max-age=300');
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch current weather' });
  }
});

router.get('/forecast', async (req, res) => {
  const { lat, lon, units = 'metric' } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  if (requireApiKey(res)) return;

  try {
    const data = await cache.wrap(`forecast:${round(lat)}:${round(lon)}:${units}`, async () => (await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
      params: {
        lat,
        lon,
        units,
        appid: WEATHER_API_KEY,
      },
      timeout: 8000,
    })).data, TTL.forecast);

    res.set('Cache-Control', 'public, max-age=300');
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch forecast data' });
  }
});

module.exports = router;
