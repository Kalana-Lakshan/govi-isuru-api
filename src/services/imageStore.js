// Where uploaded photos live. With CLOUDINARY_URL set (production), photos go to Cloudinary, resized to at
// most 1280 px and re-encoded (~150-300 KB), and the full https URL is stored. Without it (local
// development), they are written to UPLOADS_DIR and served by this API at /uploads/<folder>/<file>.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const useCloudinary = Boolean(process.env.CLOUDINARY_URL);
let cloudinary = null;
if (useCloudinary) {
  cloudinary = require('cloudinary').v2; // reads CLOUDINARY_URL from the environment
  cloudinary.config({ secure: true });
}

const ROOT_FOLDER = process.env.CLOUDINARY_FOLDER || 'govi-isuru';

function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Store one image and return the URL to save in the database.
 * @param {Buffer} buffer  image bytes
 * @param {string} folder  e.g. "listings", "unknown"
 * @param {string} prefix  file name prefix
 * @param {string} mimetype
 */
async function saveImage(buffer, folder, prefix = 'img', mimetype = 'image/jpeg') {
  const name = uniqueName(prefix);
  if (useCloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `${ROOT_FOLDER}/${folder}`,
        public_id: name,
        resource_type: 'image',
        overwrite: false,
        // keep storage and bandwidth small (free plan): max 1280 px, automatic quality
        transformation: [{ width: 1280, height: 1280, crop: 'limit', quality: 'auto:good', fetch_format: 'jpg' }],
      }, (err, res) => (err ? reject(err) : resolve(res)));
      stream.end(buffer);
    });
    return result.secure_url;
  }
  const ext = mimetype === 'image/png' ? '.png' : mimetype === 'image/webp' ? '.webp' : '.jpg';
  const dir = path.join(config.UPLOADS_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + ext), buffer);
  return `/uploads/${folder}/${name}${ext}`;
}

module.exports = { saveImage, useCloudinary };
