// ============================================================
// Telegram Bot API helper (ฝั่ง server, ใช้ fetch — เหมาะกับ webhook/serverless)
// ============================================================
import { createSupabaseAdminClient } from './supabase/admin';

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

/** แก้ไขข้อความในที่เดิม (Live Message) — true ถ้าสำเร็จ */
export async function editMessage(
  chatId: number,
  messageId: number,
  m: OutgoingMessage,
): Promise<boolean> {
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: m.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: m.reply_markup,
    });
    return true;
  } catch (e) {
    console.warn(
      `editMessage failed (chat=${chatId}, msg=${messageId}):`,
      e instanceof Error ? e.message : e,
    );
    return false;
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

/** ดาวน์โหลดรูปจาก Telegram แล้วอัปโหลดขึ้น Supabase Storage (bucket "slips") → คืน public URL
 *  ถ้า bucket ยังไม่พร้อม → fallback เป็น Telegram file URL (ชั่วคราว สำหรับ OCR)
 */
export async function uploadSlipFromTelegram(fileId: string): Promise<string> {
  const file = await tg<{ file_path: string }>('getFile', { file_id: fileId });
  const telegramUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
  const fileRes = await fetch(telegramUrl);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const path = `${Date.now()}_${fileId}.jpg`;
  try {
    const supabase = createSupabaseAdminClient();
    const { error: uploadError } = await supabase.storage
      .from('slips')
      .upload(path, buffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('slips').getPublicUrl(path);
    if (!publicUrlData?.publicUrl) throw new Error('Supabase storage returned no public URL');
    return publicUrlData.publicUrl;
  } catch (e) {
    // bucket ยังไม่มี / policy ไม่ผ่าน — อย่าให้ทั้งดีลพัง
    console.warn(
      '[uploadSlip] Supabase Storage unavailable, using Telegram file URL:',
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