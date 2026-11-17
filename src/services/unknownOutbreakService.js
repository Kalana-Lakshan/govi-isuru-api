// Early warning for possible new diseases: several photos the AI could not identify, of the same crop,
// from the same district within a week, are worth an officer's attention before anyone confirms a name.
const UnknownCase = require('../models/UnknownCase');
const Notification = require('../models/Notification');
const User = require('../models/User');

const WINDOW_DAYS = 7;
const MIN_CASES = 3;
const CROP_SI = { rice: 'වී', tea: 'තේ', chili: 'මිරිස්' };

/** Pure rule (tested): should a notification go out for this many recent cases, given what was already sent? */
function shouldNotify(recentCount, alreadyNotified) {
  return recentCount >= MIN_CASES && !alreadyNotified;
}

async function checkUnknownOutbreak({ crop, district }) {
  if (!crop || !district) return null;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const [count, existing] = await Promise.all([
    UnknownCase.countDocuments({ crop, district, status: 'pending', createdAt: { $gte: since } }),
    Notification.exists({
      type: 'disease_alert', recipientRole: 'officer', targetDistrict: district,
      'title.en': new RegExp(`^Possible new ${crop} disease`), createdAt: { $gte: since },
    }),
  ]);
  if (!shouldNotify(count, Boolean(existing))) return null;
  // One notification per approved officer of that district (all officers if none is assigned there).
  let officers = await User.find({ role: 'officer', isApproved: true, district }).select('_id').lean();
  if (!officers.length) officers = await User.find({ role: 'officer', isApproved: true }).select('_id').lean();
  const notice = {
    type: 'disease_alert',
    recipientRole: 'officer',
    targetDistrict: district,
    severity: 'warning',
    title: {
      en: `Possible new ${crop} disease in ${district}`,
      si: `${district} හි නව ${CROP_SI[crop] || crop} රෝගයක් විය හැක`,
    },
    message: {
      en: `${count} ${crop} photos from ${district} in the last ${WINDOW_DAYS} days did not match any known disease. Review them under Officer dashboard > Unknown diseases.`,
      si: `පසුගිය දින ${WINDOW_DAYS} තුළ ${district} වෙතින් ලැබුණු ${CROP_SI[crop] || crop} ඡායාරූප ${count}ක් කිසිදු දන්නා රෝගයකට නොගැළපේ. නිලධාරී පුවරුවේ "නොදන්නා රෝග" යටතේ පරීක්ෂා කරන්න.`,
    },
  };
  return Notification.insertMany(officers.map((o) => ({ ...notice, recipientUserId: o._id })));
}

module.exports = { checkUnknownOutbreak, shouldNotify, WINDOW_DAYS, MIN_CASES };
