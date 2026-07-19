// Next.js loads .env.local automatically — no dotenv import needed.
export const STICKER_IDS = {
  WELCOME:     process.env.STICKER_WELCOME_ID,
  PROCESSING:  process.env.STICKER_PROCESSING_ID,
  OCR_DONE:    process.env.STICKER_OCR_DONE_ID,
  WAITING:     process.env.STICKER_WAITING_ID,
  SUCCESS:     process.env.STICKER_SUCCESS_ID,
  ERROR:       process.env.STICKER_ERROR_ID,
  RETRY:       process.env.STICKER_RETRY_ID,
  THANK_YOU:   process.env.STICKER_THANKYOU_ID,
  VIP:         process.env.STICKER_VIP_ID,
  QUEUE:       process.env.STICKER_QUEUE_ID,
} as const;

export type StickerState = keyof typeof STICKER_IDS;

/**
 * Fail fast at startup instead of during a user flow.
 */
export function validateStickers() {
  const missing: StickerState[] = [];

  for (const [key, id] of Object.entries(STICKER_IDS)) {
    if (!id || !id.startsWith("CAACAg")) {
      missing.push(key as StickerState);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid sticker file_ids:\n` +
      missing.map(k => `  - ${k}: ${STICKER_IDS[k] || "(empty)"}`).join("\n")
    );
  }
}

/**
 * Safe getter with optional fallback.
 */
export function getSticker(state: StickerState): string | undefined {
  return STICKER_IDS[state];
}
