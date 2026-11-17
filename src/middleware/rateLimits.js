// Per-IP request limits. Protects login from password guessing and the paid AI/yield routes from abuse.
// The server runs behind one proxy (Render / Vercel rewrites), so `trust proxy` is set in index.js.
const { rateLimit } = require('express-rate-limit');

const make = (windowMin, limit, message) => rateLimit({
  windowMs: windowMin * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: message },
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = {
  api: make(15, 900, 'Too many requests. Please wait a few minutes.'),
  auth: make(15, 30, 'Too many sign-in attempts. Please wait 15 minutes and try again.'),
  ai: make(10, 40, 'Too many photos in a short time. Please wait a few minutes.'),
};
