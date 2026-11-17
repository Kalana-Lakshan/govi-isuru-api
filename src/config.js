// Central configuration. Loads .env once and refuses to start in production without real secrets.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isProd = process.env.NODE_ENV === 'production';

function secret(name, devFallback) {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (isProd) throw new Error(`${name} must be set (at least 16 characters) in production`);
  return v || devFallback; // development / tests only
}

module.exports = {
  isProd,
  PORT: Number(process.env.PORT || 5000),
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: secret('JWT_SECRET', 'dev-only-jwt-secret'),
  REFRESH_TOKEN_SECRET: secret('REFRESH_TOKEN_SECRET', 'dev-only-refresh-secret'),
  // Comma-separated list of allowed browser origins (the Next.js app). Empty = allow all (dev only).
  CORS_ORIGINS: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  AI_SERVICE_URL: (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  AI_SERVICE_KEY: process.env.AI_SERVICE_KEY || '',
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS || 20000),
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};
