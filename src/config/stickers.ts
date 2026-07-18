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

export const STICKER_FALLBACK_TEXT: Record<StickerState, string> = {
  WELCOME: 'ยินดีต้อนรับ CE Vault',
  PROCESSING: 'กำลังอ่านสลิป...',
  OCR_DONE: 'OCR สำเร็จ',
  WAITING: 'รอข้อมูลเพิ่มเติม',
  SUCCESS: 'บันทึกสำเร็จ',
  ERROR: 'เกิดข้อผิดพลาด',
  RETRY: 'ลองใหม่อีกครั้ง',
  THANK_YOU: 'ขอบคุณครับ',
  VIP: 'ลูกค้า VIP',
  QUEUE: 'อยู่ในคิวดำเนินการ',
};

function isValidStickerId(id: string | undefined): id is string {
  return Boolean(id && id.startsWith('CAACAg'));
}

export function getInvalidStickers(): StickerState[] {
  return Object.entries(STICKER_IDS)
    .filter(([, id]) => !isValidStickerId(id))
    .map(([key]) => key as StickerState);
}

/**
 * Sticker IDs are optional. Missing IDs should not fail builds or webhook cold starts.
 * Set STICKER_STRICT=1 only when you intentionally want to fail deployment on missing IDs.
 * Set STICKER_WARN_MISSING=1 to print a one-time warning for incomplete sticker config.
 */
export function validateStickers(): StickerState[] {
  const invalid = getInvalidStickers();
  if (invalid.length === 0) return invalid;

  const message =
    `Missing or invalid sticker file_ids:\n` +
    invalid.map((key) => `  - ${key}: ${STICKER_IDS[key] || '(empty)'}`).join('\n');

  if (process.env.STICKER_STRICT === '1') {
    throw new Error(message);
  }

  if (process.env.STICKER_WARN_MISSING === '1') {
    console.warn(`[sticker config] ${message}`);
  }

  return invalid;
}

export function getSticker(state: StickerState): string | undefined {
  const id = STICKER_IDS[state];
  return isValidStickerId(id) ? id : undefined;
}

export function getStickerFallbackText(state: StickerState): string {
  return STICKER_FALLBACK_TEXT[state];
}
