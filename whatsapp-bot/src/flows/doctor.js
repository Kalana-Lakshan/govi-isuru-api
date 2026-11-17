const api = require('../api');
const media = require('../media');
const { t, formatDiagnosis, pick } = require('../text');

const AI_PREDICT_COST = 25;

// The backend's multer cap is 10MB; stay comfortably under it.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const CROPS = {
  1: { key: 'rice', label: 'Rice', labelSi: 'වී' },
  2: { key: 'tea', label: 'Tea', labelSi: 'තේ' },
  3: { key: 'chili', label: 'Chili', labelSi: 'මිරිස්' }
};

/**
 * Photos are held in memory only. A bot restart loses them, which is the
 * right trade: a farmer can resend a photo, but we should not push image
 * buffers through Mongo on every diagnosis.
 */
const pendingImages = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;

function stashImage(jid, buffer) {
  pendingImages.set(jid, { buffer, at: Date.now() });
}

function takeImage(jid) {
  const entry = pendingImages.get(jid);
  if (!entry) return null;
  pendingImages.delete(jid);
  if (Date.now() - entry.at > PENDING_TTL_MS) return null;
  return entry.buffer;
}

function sweep() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [jid, entry] of pendingImages) {
    if (entry.at < cutoff) pendingImages.delete(jid);
  }
}

/** A photo arrived: hold it and ask which crop it is. */
async function onImage(ctx, buffer) {
  stashImage(ctx.jid, buffer);
  await api.setSession(ctx.jid, 'doctor', 1, {});
  await ctx.reply(t.chooseCrop(ctx.lang));
}

/** Step 1: the farmer picked a crop number. */
async function onCropChoice(ctx, session) {
  const choice = CROPS[ctx.body.trim()];

  if (!choice) {
    await ctx.reply(t.chooseCrop(ctx.lang));
    return;
  }

  const buffer = takeImage(ctx.jid);
  if (!buffer) {
    await api.clearSession(ctx.jid);
    await ctx.reply(t.noPhotoPending(ctx.lang));
    return;
  }

  await ctx.reply(t.analysing(ctx.lang));
  await ctx.typing();

  // Cap oversized camera photos before upload - see media.shrinkImage.
  let payload = buffer;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    try {
      payload = await media.shrinkImage(buffer);
      console.log(`Resized photo ${buffer.length} -> ${payload.length} bytes`);
    } catch (err) {
      console.warn('Photo resize failed, sending original:', err.message);
    }
  }

  let token;
  try {
    token = await ctx.token();
  } catch (err) {
    await api.clearSession(ctx.jid);
    await ctx.reply(t.notLinkedForThis(ctx.lang));
    return;
  }

  try {
    const result = await api.predictDisease(token, choice.key, payload);
    const label = ctx.lang === 'si' ? choice.labelSi : choice.label;

    // v2 AI service: every answer has a status; only KNOWN_DISEASE carries a diagnosis.
    if (result.status && result.status !== 'KNOWN_DISEASE') {
      await replyWithoutDiagnosis(ctx, choice, payload, result);
      return;
    }

    // gradcam is an object: { overlay, heatmap }. The overlay keeps the leaf
    // visible under the heat, which is the one worth showing a farmer.
    const overlay = result.gradcam?.overlay || result.gradcam?.heatmap || null;
    const card = formatDiagnosis(ctx.lang, result, label);

    let sent = false;
    if (overlay) {
      try {
        const b64 = String(overlay).replace(/^data:image\/\w+;base64,/, '');
        const png = Buffer.from(b64, 'base64');
        if (png.length > 0) {
          await ctx.sendImage(png, card);
          sent = true;
        }
      } catch (err) {
        console.warn('Grad-CAM send failed, falling back to text:', err.message);
      }
    }
    if (!sent) await ctx.reply(card);

    // Remember it so "report" can warn the neighbours
    await api.setSession(ctx.jid, 'doctor', 2, {
      crop: choice.key,
      disease: result.prediction || result.disease || result.predicted_class,
      confidence: result.confidence,
      treatment: Array.isArray(result.treatment)
        ? result.treatment.join('; ')
        : (typeof result.treatment === 'string' ? result.treatment : '')
    });
  } catch (err) {
    // A crop mismatch is recoverable, so decide whether to keep the session
    // before tearing it down.
    const detail = err.body?.detail;
    const guard = typeof detail === 'object' && detail ? detail : null;

    if (err.status === 429) {
      await api.clearSession(ctx.jid);
      await ctx.reply(pick(ctx.lang, {
        en: '⏳ Too many photos in a short time. Please wait a few minutes and try again.',
        si: '⏳ කෙටි කාලයක් තුළ ඡායාරූප බොහොමයක්. මිනිත්තු කිහිපයකින් නැවත උත්සාහ කරන්න.'
      }));
      return;
    }

    if (err.status === 422 && guard?.code === 'CROP_MISMATCH') {
      const detected = String(guard.validation?.best_matched_crop || '').toLowerCase();
      const entry = Object.entries(CROPS).find(([, c]) => c.key === detected);

      if (entry) {
        // Keep the photo and the cursor so a single digit re-runs it.
        stashImage(ctx.jid, payload);
        await api.setSession(ctx.jid, 'doctor', 1, {});

        const [num, crop] = entry;
        const name = ctx.lang === 'si' ? crop.labelSi : crop.label;
        await ctx.reply(pick(ctx.lang, {
          en: `🤔 That looks like a *${name}* leaf, not ${choice.label}.\n\nReply *${num}* to check it as ${name}, or send a clearer photo.`,
          si: `🤔 එය *${name}* කොළයක් සේ පෙනේ, ${choice.labelSi} නොවේ.\n\n${name} ලෙස පරීක්ෂා කිරීමට *${num}* එවන්න, නැතහොත් පැහැදිලි ඡායාරූපයක් එවන්න.`
        }));
        return;
      }

      await api.clearSession(ctx.jid);
      await ctx.reply(pick(ctx.lang, {
        en: `🤔 ${guard.message || 'That does not look like the crop you chose.'}`,
        si: '🤔 එය ඔබ තෝරාගත් බෝගය නොවේ. පැහැදිලි ඡායාරූපයක් එවන්න.'
      }));
      return;
    }

    await api.clearSession(ctx.jid);

    if (err.status === 422 && guard?.code === 'NOT_A_LEAF') {
      await ctx.reply(pick(ctx.lang, {
        en: '🍃 That does not look like a crop leaf.\n\nHold the camera close to a single leaf, in daylight, with the leaf filling most of the frame.',
        si: '🍃 එය බෝග කොළයක් සේ නොපෙනේ.\n\nදිවා ආලෝකයේ තනි කොළයකට කැමරාව ළං කර ඡායාරූපයක් ගන්න.'
      }));
      return;
    }

    if (err.status === 403) {
      await ctx.reply(t.insufficientCredits(ctx.lang, err.body?.credits ?? 0, AI_PREDICT_COST));
      return;
    }
    if (err.status === 503) {
      await ctx.reply(t.aiUnavailable(ctx.lang));
      return;
    }
    if (err.status === 0 || err.body?.error === 'EMPTY_IMAGE') {
      // The media download came back empty - ask for the photo again rather
      // than sending nothing upstream and reporting a mystery failure.
      await ctx.reply(pick(ctx.lang, {
        en: '📸 That photo did not download fully. Please send it again.',
        si: '📸 එම ඡායාරූපය සම්පූර්ණයෙන් බාගත නොවීය. නැවත එවන්න.'
      }));
      return;
    }

    if (err.status === 422) {
      // An unrecognised rejection from the model service's input guards.
      await ctx.reply(pick(ctx.lang, {
        en: `📸 ${guard?.message || 'I could not use that image.'}\n\nTry a fresh close-up of a single leaf.`,
        si: '📸 එම රූපය භාවිත කළ නොහැකි විය. තනි කොළයක නව ඡායාරූපයක් ගන්න.'
      }));
      return;
    }

    if (err.status === 400) {
      // Leaf-likeness / crop-mismatch guard rejected the photo
      await ctx.reply(pick(ctx.lang, {
        en: `🤔 ${err.body?.error || err.body?.msg || 'That does not look like a leaf of that crop.'}\n\nTry a clear, close photo of a single leaf in daylight.`,
        si: `🤔 ${err.body?.error || err.body?.msg || 'එය එම බෝගයේ කොළයක් ලෙස නොපෙනේ.'}\n\nදිවා ආලෝකයේ තනි කොළයක පැහැදිලි ඡායාරූපයක් ගන්න.`
      }));
      return;
    }

    if (err.status === 413 || err.status === 500) {
      // Typically an upload the backend refused before returning JSON.
      await ctx.reply(pick(ctx.lang, {
        en: '📸 That photo was too large for me to process. Try sending it again — WhatsApp will compress it.',
        si: '📸 එම ඡායාරූපය විශාල වැඩියි. නැවත එවන්න.'
      }));
      return;
    }

    console.warn('Diagnosis failed:', err.message);
    await ctx.reply(t.error(ctx.lang));
  }
}

/** "report" after a diagnosis - warns other farmers in the same GN division. */
async function onReport(ctx, session) {
  const draft = session?.draft || {};

  if (!draft.disease) {
    await ctx.reply(pick(ctx.lang, {
      en: '📸 Diagnose a leaf photo first, then reply *report* to warn your neighbours.',
      si: '📸 පළමුව කොළයක් පරීක්ෂා කරන්න, පසුව *report* එවන්න.'
    }));
    return;
  }

  if (ctx.isGuest) {
    await ctx.reply(t.guestWriteBlocked(ctx.lang));
    await api.clearSession(ctx.jid);
    return;
  }

  try {
    const token = await ctx.token();
    const user = ctx.user || {};

    const res = await api.reportDisease(token, {
      crop: draft.crop,
      disease: draft.disease,
      confidence: draft.confidence,
      district: user.district,
      dsDivision: user.dsDivision,
      gnDivision: user.gnDivision,
      treatment: draft.treatment,
      farmerUsername: user.username
    });

    await api.clearSession(ctx.jid);
    await ctx.reply(pick(ctx.lang, {
      en: `✅ Reported. Officers in ${user.district} can see this, and farmers near ${user.gnDivision} will be warned if more cases appear.${res.alertsTriggered ? `\n\n🚨 ${res.alertsTriggered} alert(s) triggered.` : ''}`,
      si: `✅ වාර්තා කළා. ${user.district} නිලධාරීන්ට මෙය පෙනේ.${res.alertsTriggered ? `\n\n🚨 අනතුරු ඇඟවීම් ${res.alertsTriggered}ක්.` : ''}`
    }));
  } catch (err) {
    console.warn('Disease report failed:', err.message);
    await ctx.reply(t.error(ctx.lang));
  }
}

async function handle(ctx, session) {
  if (session.step === 1) return onCropChoice(ctx, session);
  if (session.step === 2 && /^report$/i.test(ctx.body.trim())) return onReport(ctx, session);
  return false; // not ours - let the router fall through
}


// Answers from the v2 AI service that are not a diagnosis (see govi-isuru-api docs/FEATURE_WORKFLOWS.md §4).
async function replyWithoutDiagnosis(ctx, choice, payload, result) {
  const status = result.status;
  if (status === 'WRONG_CROP') {
    const detected = String(result.detected_crop || '').toLowerCase();
    const entry = Object.entries(CROPS).find(([, c]) => c.key === detected);
    if (entry) {
      stashImage(ctx.jid, payload);
      await api.setSession(ctx.jid, 'doctor', 1, {});
      const [num, crop] = entry;
      const name = ctx.lang === 'si' ? crop.labelSi : crop.label;
      await ctx.reply(pick(ctx.lang, {
        en: `🤔 That looks like a *${name}* leaf, not ${choice.label}.\n\nReply *${num}* to check it as ${name}, or send a clearer photo.`,
        si: `🤔 එය *${name}* කොළයක් සේ පෙනේ, ${choice.labelSi} නොවේ.\n\n${name} ලෙස පරීක්ෂා කිරීමට *${num}* එවන්න, නැතහොත් පැහැදිලි ඡායාරූපයක් එවන්න.`
      }));
      return;
    }
  }

  await api.clearSession(ctx.jid);
  const advice = Array.isArray(result.advice) && result.advice.length
    ? `\n\n${result.advice.map((a) => `• ${a}`).join('\n')}` : '';
  const possible = Array.isArray(result.all_predictions) && result.all_predictions.length
    ? `\n\n${result.all_predictions.map((p) => `• ${ctx.lang === 'si' && p.si_name ? p.si_name : p.disease}: ${Math.round((p.confidence || 0) * 100)}%`).join('\n')}`
    : '';
  const replies = {
    BAD_PHOTO: {
      en: `📷 The photo is not clear enough. Please take it again.${advice}`,
      si: `📷 ඡායාරූපය ප්‍රමාණවත් තරම් පැහැදිලි නැත. කරුණාකර නැවත ගන්න.${advice}`
    },
    NOT_A_PLANT: {
      en: '🍃 That does not look like a plant.\n\nHold the camera close to a single leaf, in daylight, with the leaf filling most of the frame.',
      si: '🍃 එය ශාකයක් සේ නොපෙනේ.\n\nදිවා ආලෝකයේ තනි කොළයකට කැමරාව ළං කර ඡායාරූපයක් ගන්න.'
    },
    UNSUPPORTED_PLANT: {
      en: '🌱 Only paddy, tea and chili are supported at the moment.',
      si: '🌱 දැනට වී, තේ සහ මිරිස් පමණක් සහාය දක්වයි.'
    },
    WRONG_CROP: {
      en: '🤔 That does not look like the crop you chose. Please send a clearer photo.',
      si: '🤔 එය ඔබ තෝරාගත් බෝගය නොවේ. පැහැදිලි ඡායාරූපයක් එවන්න.'
    },
    UNKNOWN_DISEASE: {
      en: `🔎 This does not match any disease the AI knows. The photo was sent to an agricultural officer for review.${result.case_id ? `\n\nCase: ${String(result.case_id).slice(-8)}` : ''}`,
      si: `🔎 මෙය AI දන්නා රෝගයකට නොගැළපේ. ඡායාරූපය කෘෂිකර්ම නිලධාරියෙකු වෙත යොමු කරන ලදී.${result.case_id ? `\n\nනඩු අංකය: ${String(result.case_id).slice(-8)}` : ''}`
    },
    LOW_CONFIDENCE: {
      en: `🤔 The AI is not sure. Possible causes:${possible}\n\nPlease consult an agricultural officer (send *8* to book one).`,
      si: `🤔 AI හට නිශ්චිත නැත. විය හැකි හේතු:${possible}\n\nකෘෂිකර්ම නිලධාරියෙකුගෙන් විමසන්න (වෙන්කරවා ගැනීමට *8* එවන්න).`
    }
  };
  const msg = replies[status] || { en: result.message || status, si: result.message || status };
  const refunded = result.credits_refunded
    ? pick(ctx.lang, { en: '\n\n_No credits were charged._', si: '\n\n_ණය ගාස්තු අය නොකෙරිණි._' }) : '';
  await ctx.reply(pick(ctx.lang, msg) + refunded);
}

module.exports = { onImage, onReport, handle, sweep, CROPS };
