const mongoose = require('mongoose');

// A photo the AI service could not match to any known disease (status UNKNOWN_DISEASE).
// Officers review these, group them and confirm new diseases (docs/INTEGRATION.md §4 in the AI service).
const UnknownCaseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  crop: { type: String, enum: ['rice', 'tea', 'chili'], required: true },
  district: { type: String, default: '' },
  imagePath: { type: String, required: true },
  embedding: { type: String, required: true }, // embedding_f16_base64 from the AI service
  nearestKnown: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'confirmed', 'dismissed'], default: 'pending' },
  confirmedLabel: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  modelVersion: String,
}, { timestamps: true });

UnknownCaseSchema.index({ crop: 1, status: 1, createdAt: -1 });
UnknownCaseSchema.index({ district: 1, createdAt: -1 });

module.exports = mongoose.model('UnknownCase', UnknownCaseSchema);
