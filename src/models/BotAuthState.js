const mongoose = require('mongoose');

// The WhatsApp bot's login (Baileys multi-file auth state), copied here so a restart on hosting
// without a persistent disk (e.g. Render free) does not force a new QR pairing.
// `files` maps each auth file name to its contents (JSON text). Only the bot can read or write it.
const BotAuthStateSchema = new mongoose.Schema({
  _id: { type: String },              // e.g. "default"
  files: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('BotAuthState', BotAuthStateSchema);
