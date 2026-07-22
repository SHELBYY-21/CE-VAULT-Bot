// ============================================================
// Telegram Bot API helper (ฝั่ง server, ใช้ fetch — เหมาะกับ webhook/serverless)
// ============================================================
import { adminStorage, storageBucketName } from './firebaseAdmin';

const TOKEN = process.env.BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg<T = any>(method: string, payload: Record<string, any>): Promise<T> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result as T;
}

export interface OutgoingMessage {
  text: string;
  reply_markup?: unknown;
}

/** ส่งข้อความ → คืน message_id */
export async function sendMessage(chatId: number, m: OutgoingMessage): Promise<number> {
  const r = await tg<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: m.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: m.reply_markup,
  });
  return r.message_id;
}

/** ส่งไฟล์ (เช่น CSV) เป็น document ในแชต */
export async function sendDocument(
  chatId: number,
  filename: string,
  content: string,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  form.append('document', new Blob(['﻿' + content], { type: 'text/csv' }), filename);
  await fetch(`${API}/sendDocument`, { method: 'POST', body: form }).catch(() => undefined);
}

/** แก้ไขข้อความในที่เดิม (เอฟเฟกต์ progress) */
export async function editMessage(chatId: number, messageId: number, m: OutgoingMessage): Promise<void> {
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: m.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: m.reply_markup,
    });
  } catch (e) {
    console.warn(`editMessage failed (chat=${chatId}, msg=${messageId}):`, e instanceof Error ? e.message : e);
  }
}

export async function sendChatAction(chatId: number, action: string): Promise<void> {
  try {
    await tg('sendChatAction', { chat_id: chatId, action });
  } catch (e) {
    console.warn(`sendChatAction failed (chat=${chatId}, action=${action}):`, e instanceof Error ? e.message : e);
  }
}

/** ตอบ callback_query (ปิดสถานะ "กำลังโหลด" ที่ปุ่ม) */
export async function answerCallback(id: string, text?: string): Promise<void> {
  try {
    await tg('answerCallbackQuery', { callback_query_id: id, text });
  } catch (e) {
    console.warn(`answerCallback failed (id=${id}):`, e instanceof Error ? e.message : e);
  }
}

/** ส่ง sticker (ใช้ file_id จาก env vars) — ไม่ throw ถ้า error */
export async function sendSticker(chatId: number, fileId: string): Promise<void> {
  try {
    await tg('sendSticker', { chat_id: chatId, sticker: fileId });
  } catch (e) {
    console.warn(`sendSticker failed (chat=${chatId}):`, e instanceof Error ? e.message : e);
  }
}

/** ดาวน์โหลดรูปจาก Telegram แล้วอัปโหลดขึ้น Firebase Storage → คืน public URL
 *  ถ้า Storage/Billing ยังไม่พร้อม → fallback เป็น Telegram file URL (ชั่วคราว สำหรับ OCR)
 */
export async function uploadSlipFromTelegram(fileId: string): Promise<string> {
  const file = await tg<{ file_path: string }>('getFile', { file_id: fileId });
  const telegramUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
  const fileRes = await fetch(telegramUrl);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const path = `slips/${Date.now()}_${fileId}.jpg`;
  try {
    const bucket = adminStorage.bucket(storageBucketName());
    const f = bucket.file(path);
    await f.save(buffer, {
      contentType: 'image/jpeg',
      resumable: false,
      metadata: { cacheControl: 'public,max-age=31536000' },
    });

    if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
      const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
      return `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
    }
    await f.makePublic().catch(() => undefined);
    return `https://storage.googleapis.com/${bucket.name}/${path}`;
  } catch (e) {
    // OR_BACR2_44 / billing absent / bucket missing — อย่าให้ทั้งดีลพัง
    console.warn(
      '[uploadSlip] Firebase Storage unavailable, using Telegram file URL:',
      e instanceof Error ? e.message : e,
    );
    return telegramUrl;
  }
}

/** URL ที่ปลอดภัยสำหรับเก็บใน DB — ไม่เก็บ bot token ของ Telegram */
export function toPersistedSlipUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.includes('api.telegram.org/file/bot')) return '';
  return url;
}
