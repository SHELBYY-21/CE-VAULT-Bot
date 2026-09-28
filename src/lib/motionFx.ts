/**
 * CE EMPIRE motion layer — mascot WEBM stickers + OCR progress effect
 * for every Live Message stage (docs/motion-fx-lock.md).
 *
 * - Additive presentation only: the text message stays authoritative and a
 *   failed sticker or effect can never break a deal (all paths are caught).
 * - Reuses src/config/stickers.ts: WEBM_*_FILE_ID first, static sticker
 *   fallback, and nothing is sent when no file_id is configured.
 * - The OCR progress effect rotates a decorative scan glyph. It never shows
 *   invented progress numbers; the real amount comes only from OCR.
 * - CE_MOTION_FX=0 disables the whole layer (ops kill switch).
 */
import { editMessage, sendSticker, type OutgoingMessage } from './telegram';
import { getSticker, getWebmMotionSticker, type StickerState } from '../config/stickers';

const FX_STEP_MS = 700;

/**
 * Live frame → sticker moment. Detection is text-based on purpose: the
 * webhook funnel (upsertLive) has no stage parameter, and every frame
 * renderer is already locked by the design contract + tests.
 * Error frames first: MSG-29 renders "◈ CE · ERROR", MSG-03 "◈ CE · OCR ERROR".
 */
export function motionMoment(text: string): StickerState | null {
  if (!text) return null;
  if (
    text.includes('<b>● Error</b>') ||
    text.includes('◈ CE · ERROR') ||
    text.includes('OCR ERROR')
  ) {
    return 'ERROR';
  }
  if (text.includes('◈ CE · MISMATCH')) return 'RETRY';
  if (text.includes('<b>● Receiving...</b>')) return 'PROCESSING';
  if (text.includes('◈ CE · OCR') || text.includes('<b>● OCR</b>')) return 'PROCESSING';
  if (text.includes('<b>● Verified</b>')) return 'OCR_DONE';
  if (text.includes('<b>● Waiting</b>')) return 'WAITING';
  if (text.includes('◈ CE · RECORDED ✓')) return 'SUCCESS';
  return null;
}

/** Marker line inside the MSG-01 OCR frame (src/lib/liveMessage.ts liveOcr). */
const OCR_SCAN_LINE = '⏳ OCR กำลังประมวลผล';

/** Decorative scan glyphs — never a business claim. */
const OCR_FX_FRAMES = [
  '⏳ OCR ◐ กำลังสแกนสลิป...',
  '⏳ OCR ◓ ตรวจจับยอดตัวเลข...',
];

export function motionFxEnabled(): boolean {
  return process.env.CE_MOTION_FX !== '0';
}

/** Best-effort per-instance dedupe: one sticker per (live message, moment). */
const sentMoments = new Set<string>();
const SENT_MAX = 512;

function sendMomentSticker(chatId: number, messageId: number, moment: StickerState): void {
  const key = chatId + ':' + messageId + ':' + moment;
  if (sentMoments.has(key)) return;
  if (sentMoments.size >= SENT_MAX) sentMoments.clear();
  sentMoments.add(key);
  const fileId = getWebmMotionSticker(moment) || getSticker(moment);
  if (fileId) sendSticker(chatId, fileId).catch(() => undefined);
}

/** OCR progress effects still running, keyed by live message id. */
const ocrFxAlive = new Map<number, boolean>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOcrFrame(text: string): boolean {
  return motionMoment(text) === 'PROCESSING' && text.includes(OCR_SCAN_LINE);
}

function startOcrFx(chatId: number, messageId: number, baseText: string): void {
  if (!baseText.includes(OCR_SCAN_LINE)) return;
  if (ocrFxAlive.has(messageId)) return; // one effect per live message
  ocrFxAlive.set(messageId, true);
  void (async () => {
    try {
      for (const frame of OCR_FX_FRAMES) {
        await sleep(FX_STEP_MS);
        if (ocrFxAlive.get(messageId) !== true) return;
        const ok = await editMessage(chatId, messageId, {
          text: baseText.split(OCR_SCAN_LINE).join(frame),
        });
        if (!ok) return;
      }
    } catch {
      // A motion effect must never surface as a bot error.
    } finally {
      ocrFxAlive.delete(messageId);
    }
  })();
}

/**
 * Call BEFORE applying a Live Message edit: when a different stage is
 * arriving, stop that message OCR progress effect so it can never
 * overwrite the new frame after it lands.
 */
export function motionGate(
  messageId: number | null | undefined,
  message: OutgoingMessage,
): void {
  if (messageId == null) return;
  if (isOcrFrame(message.text)) return;
  ocrFxAlive.delete(messageId);
}

/** Fire-and-forget AFTER a stage frame was applied to a live message. */
export function motionAfter(
  chatId: number,
  messageId: number,
  message: OutgoingMessage,
): void {
  if (!motionFxEnabled()) return;
  const moment = motionMoment(message.text);
  if (!moment) return;
  sendMomentSticker(chatId, messageId, moment);
  if (moment === 'PROCESSING') startOcrFx(chatId, messageId, message.text);
}
