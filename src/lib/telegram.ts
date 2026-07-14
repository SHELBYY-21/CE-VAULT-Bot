// ============================================================
// Telegram Bot API helper (ฝั่ง server, ใช้ fetch — เหมาะกับ webhook/serverless)
// ============================================================
import { supabaseAdmin } from './supabaseAdmin';

const TOKEN = process.env.BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;
const BUCKET = process.env.SUPABASE_BUCKET || 'slips';

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

/** ดาวน์โหลดรูปจาก Telegram แล้วอัปโหลดขึ้น Supabase Storage → คืน public URL */
export async function uploadSlipFromTelegram(fileId: string): Promise<string> {
  const file = await tg<{ file_path: string }>('getFile', { file_id: fileId });
  const fileRes = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const path = `slips/${Date.now()}_${fileId}.jpg`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;

  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
