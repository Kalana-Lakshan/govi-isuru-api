// Per-IP request limits. Protects login from password guessing and the paid AI/yield routes from abuse.
// The server runs behind one proxy (Render / Vercel rewrites), so `trust proxy` is set in index.js.
// The WhatsApp bot sends every farmer's request from one server and applies its own per-user limits
// (whatsapp-bot/src/limits.js), so requests carrying the bot's shared key are not counted here.
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');

function fromBot(req) {
  const expected = process.env.WHATSAPP_BOT_KEY || '';
  const presented = req.get('x-bot-key') || '';
  if (!expected || presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

const make = (windowMin, limit, message) => rateLimit({
  windowMs: windowMin * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: message },
  skip: (req) => process.env.NODE_ENV === 'test' || fromBot(req),
});

module.exports = {
  fromBot,
  api: make(15, 900, 'Too many requests. Please wait a few minutes.'),
  auth: make(15, 30, 'Too many sign-in attempts. Please wait 15 minutes and try again.'),
  ai: make(10, 40, 'Too many photos in a short time. Please wait a few minutes.'),
};
