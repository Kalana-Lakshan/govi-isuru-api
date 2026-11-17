// Shapes AI-service responses for the web app. Pure functions (unit-tested in test/aiPresenter.test.js).
// Keeps the fields the original AI Doctor screen reads (prediction, confidence, all_predictions, gradcam,
// treatment, severity...) next to the new status-based ones.

const MESSAGES = {
  KNOWN_DISEASE: null,
  LOW_CONFIDENCE: 'The AI is not sure. Possible causes are listed below; please consult an agricultural officer.',
  UNKNOWN_DISEASE: 'This does not match any disease the AI knows. The photo was sent to an agricultural officer for review.',
  WRONG_CROP: 'This photo looks like a different crop. Diagnose it as the detected crop instead?',
  UNSUPPORTED_PLANT: 'Only rice (paddy), tea and chili are supported at the moment.',
  NOT_A_PLANT: 'This does not look like a plant. Please photograph a single leaf.',
  BAD_PHOTO: 'The photo is not clear enough. Please take it again.',
};

const NO_ADVICE = 'Treatment advice is being prepared by agronomists. Please consult your agricultural officer.';

const pretty = (id) => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function classInfo(catalogue, crop, cls) {
  const info = catalogue?.crops?.[crop]?.[cls] || {};
  const name = info.name || {};
  const advice = info.advice || {};
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  return {
    id: cls,
    type: info.type || null,
    name: { en: name.en || pretty(cls), si: name.si || '', ta: name.ta || '' },
    advice: { en: list(advice.en), si: list(advice.si), ta: list(advice.ta) },
  };
}

function present(result, requestedCrop, catalogue) {
  const status = result.status;
  const crop = result.crop || result.detected_crop || requestedCrop || null;
  const out = {
    status,
    message: MESSAGES[status] ?? null,
    crop_type: crop,
    requested_crop: requestedCrop || null,
    detected_crop: result.detected_crop || result.crop || null,
    reason: result.reason || null,
    problems: result.problems || [],
    advice: result.advice || [],
    photo_quality: result.photo_quality || null,
    model: result.model || null,
    dev_model: Boolean(result.model?.warning),
  };
  if (Array.isArray(result.top3)) {
    out.all_predictions = result.top3.map((t) => {
      const info = classInfo(catalogue, crop, t.class);
      return { class: t.class, disease: info.name.en, si_name: info.name.si, confidence: t.probability };
    });
  }
  if (status === 'KNOWN_DISEASE') {
    const info = classInfo(catalogue, crop, result.class);
    Object.assign(out, {
      class: result.class,
      source: result.source,
      info,
      prediction: info.name.en,
      si_name: info.name.si,
      confidence: result.confidence ?? null,
      treatment: info.advice.en.length ? info.advice.en : [NO_ADVICE],
      description: info.type ? `${pretty(info.type)} problem` : '',
      severity: result.class === 'healthy' ? 'none' : 'moderate',
    });
  }
  if (result.heatmap_png_base64) out.gradcam = { overlay: result.heatmap_png_base64 };
  return out;
}

module.exports = { present, classInfo, MESSAGES };
