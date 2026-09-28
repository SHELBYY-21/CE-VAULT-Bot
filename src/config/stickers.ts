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

/**
 * Telegram .WEBM/VP9 motion stickers are sent with sendSticker(file_id).
 * Configure one of these after uploading the WebM to Telegram; a bare HTTP
 * URL cannot be used for video stickers. Optional: no extra media if unset.
 * The text message remains authoritative if a sticker fails.
 * Mascot sources and storyboards: docs/mascot-motion-lock.md
 */
const WEBM_MOTION_IDS: Partial<Record<StickerState, string | undefined>> = {
  PROCESSING: process.env.WEBM_PROCESSING_FILE_ID,
  OCR_DONE: process.env.WEBM_OCR_DONE_FILE_ID,
  WAITING: process.env.WEBM_WAITING_FILE_ID,
  SUCCESS: process.env.WEBM_SUCCESS_FILE_ID,
  ERROR: process.env.WEBM_ERROR_FILE_ID,
  WELCOME: process.env.WEBM_WELCOME_FILE_ID,
  QUEUE: process.env.WEBM_QUEUE_FILE_ID,
  THANK_YOU: process.env.WEBM_THANK_YOU_FILE_ID,
  RETRY: process.env.WEBM_RETRY_FILE_ID,
};

export function getWebmMotionSticker(state: StickerState): string | undefined {
  const id = WEBM_MOTION_IDS[state]?.trim();
  return id && id.startsWith('CAACAg') ? id : undefined;
}

/**
 * Official CE EMPIRE mascot motion assets (docs/mascot-motion-lock.md).
 * Rendered by `node scripts/render-mascot-webm.mjs` into assets/mascot/,
 * uploaded to Telegram as video stickers; only the returned file_id is used.
 */
export const MASCOT_WEBM_ASSETS = {
  HI: 'assets/mascot/hi.webm',
  SCAN: 'assets/mascot/scan.webm',
  WAIT: 'assets/mascot/wait.webm',
  WORK: 'assets/mascot/work.webm',
  SUCCESS: 'assets/mascot/success.webm',
  ALERT: 'assets/mascot/alert.webm',
  DONE: 'assets/mascot/done.webm',
  IDLE: 'assets/mascot/idle.webm',
} as const;

export type MascotMotion = keyof typeof MASCOT_WEBM_ASSETS;

/**
 * Bot sticker moment → mascot motion for that moment.
 * IDLE is intentionally unmapped: it is an ambient loop and must never be
 * attached to an unsolicited bot moment.
 */
export const STICKER_STATE_MASCOT: Partial<Record<StickerState, MascotMotion>> = {
  WELCOME: 'HI',
  PROCESSING: 'SCAN',
  WAITING: 'WAIT',
  QUEUE: 'WORK',
  SUCCESS: 'SUCCESS',
  ERROR: 'ALERT',
  RETRY: 'ALERT',
  OCR_DONE: 'DONE',
  THANK_YOU: 'DONE',
};
