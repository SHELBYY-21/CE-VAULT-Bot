// Sticker file_ids from Telegram (optional — empty = skip sending that sticker).
// After publishing the sticker pack, paste each file_id into .env.local.
// file_id of animated stickers usually starts with CAACAg...
export const STICKER_IDS = {
  WELCOME: process.env.STICKER_WELCOME_ID,
  PROCESSING: process.env.STICKER_PROCESSING_ID,
  OCR_DONE: process.env.STICKER_OCR_DONE_ID,
  WAITING: process.env.STICKER_WAITING_ID,
  SUCCESS: process.env.STICKER_SUCCESS_ID,
  ERROR: process.env.STICKER_ERROR_ID,
  RETRY: process.env.STICKER_RETRY_ID,
  THANK_YOU: process.env.STICKER_THANKYOU_ID,
  VIP: process.env.STICKER_VIP_ID,
  QUEUE: process.env.STICKER_QUEUE_ID,
} as const;

export type StickerState = keyof typeof STICKER_IDS;

/**
 * Stickers are optional. Missing/invalid IDs only log a warning — never crash cold-start.
 */
export function validateStickers() {
  const missing: StickerState[] = [];

  for (const [key, id] of Object.entries(STICKER_IDS)) {
    if (!id) continue; // empty = intentionally skipped
    if (!id.startsWith('CAACAg')) {
      missing.push(key as StickerState);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[stickers] invalid file_ids (will skip):\n` +
        missing.map((k) => `  - ${k}: ${STICKER_IDS[k]}`).join('\n'),
    );
  }
}

/** Safe getter — undefined when unset */
export function getSticker(state: StickerState): string | undefined {
  const id = STICKER_IDS[state];
  return id && id.startsWith('CAACAg') ? id : undefined;
}
