// ============================================================
// จัดการสถานะสนทนาต่อผู้ใช้ + chat-level settings (per-group rate)
// ============================================================
import { supabaseAdmin } from './supabaseAdmin';

export type SessionState = 'AWAITING_NAME' | 'AWAITING_AMOUNT' | 'EDITING' | 'WAITING_USDT';

export interface BotSession {
  chat_id: number;
  telegram_user_id: number;
  state: SessionState;
  pending_type?: 'THB_DEPOSIT' | 'USDT_SEND' | null;
  slip_url?: string | null;
  caption?: string | null;
  ocr_thb?: number | null;
  slip_date?: string | null;
  slip_time?: string | null;
  slip_last4?: string | null;
  slip_bank?: string | null;
  slip_receiver_name?: string | null;
  ocr_conf?: number | null;          // ความมั่นใจ OCR สลิป THB
  ledger_ref?: string | null;        // Ledger ID ของดีลที่กำลังทำ
  // ── pending USDT (ระหว่างรอ/ยืนยัน) ──
  pending_usdt?: number | null;
  usdt_network?: string | null;
  usdt_txid?: string | null;
  usdt_image_url?: string | null;
  admin_id?: string | null; // cache admin id เพื่อไม่ต้อง re-query
  admin_name?: string | null; // cache admin name
}

export async function getSession(chatId: number, userId: number): Promise<BotSession | null> {
  const { data } = await supabaseAdmin
    .from('bot_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .eq('telegram_user_id', userId)
    .maybeSingle();
  return (data as BotSession) ?? null;
}

export async function setSession(
  chatId: number,
  userId: number,
  patch: Partial<Omit<BotSession, 'chat_id' | 'telegram_user_id'>>,
): Promise<void> {
  const base = {
    chat_id: chatId,
    telegram_user_id: userId,
    state: patch.state,
    pending_type: patch.pending_type ?? null,
    slip_url: patch.slip_url ?? null,
    caption: patch.caption ?? null,
    ocr_thb: patch.ocr_thb ?? null,
    updated_at: new Date().toISOString(),
  };
  const full = {
    ...base,
    slip_date: patch.slip_date ?? null,
    slip_time: patch.slip_time ?? null,
    slip_last4: patch.slip_last4 ?? null,
    slip_bank: patch.slip_bank ?? null,
    slip_receiver_name: patch.slip_receiver_name ?? null,
    ocr_conf: patch.ocr_conf ?? null,
    ledger_ref: patch.ledger_ref ?? null,
    pending_usdt: patch.pending_usdt ?? null,
    usdt_network: patch.usdt_network ?? null,
    usdt_txid: patch.usdt_txid ?? null,
    usdt_image_url: patch.usdt_image_url ?? null,
  };
  const { error } = await supabaseAdmin
    .from('bot_sessions')
    .upsert(full, { onConflict: 'chat_id,telegram_user_id' });
  // ถ้ายังไม่ได้รัน patch-v2 (คอลัมน์ slip_* ยังไม่มี) → fallback เขียนเฉพาะคอลัมน์เดิม
  if (error) {
    const { error: fallbackError } = await supabaseAdmin
      .from('bot_sessions')
      .upsert(base, { onConflict: 'chat_id,telegram_user_id' });
    // ถ้า fallback ก็ยังล้ม แปลว่าปัญหาระดับ connection/คีย์ ไม่ใช่แค่คอลัมน์ขาด → log ให้เห็น
    if (fallbackError) {
      console.error(
        `[setSession] เขียน session ไม่สำเร็จ (chat=${chatId}, user=${userId}): ${fallbackError.message}`,
      );
    }
  }
}

export async function clearSession(chatId: number, userId: number): Promise<void> {
  await supabaseAdmin
    .from('bot_sessions')
    .delete()
    .eq('chat_id', chatId)
    .eq('telegram_user_id', userId);
}

// ─── Per-chat fixed rate (เรตของแต่ละกลุ่ม) — degrade เงียบถ้ายังไม่มีตาราง chat_settings ───
export async function getChatRate(chatId: number): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_settings')
      .select('fixed_rate')
      .eq('chat_id', chatId)
      .maybeSingle();
    if (error) return null;
    return data?.fixed_rate ? Number(data.fixed_rate) : null;
  } catch {
    return null;
  }
}

export async function setChatRate(chatId: number, rate: number, roomName?: string | null): Promise<void> {
  const row: any = { chat_id: chatId, fixed_rate: rate, updated_at: new Date().toISOString() };
  if (roomName) row.room_name = roomName;
  await supabaseAdmin
    .from('chat_settings')
    .upsert(row)
    .then(undefined, () => undefined);
}

/** ดึงเรต + ชื่อห้อง + จุดตัดวัน (Sell Rate มาจาก fixed_rate) */
export async function getRoom(
  chatId: number,
): Promise<{ rate: number | null; name: string | null; dayCutAt: string | null }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_settings')
      .select('fixed_rate, room_name, day_cut_at')
      .eq('chat_id', chatId)
      .maybeSingle();
    if (error || !data) return { rate: null, name: null, dayCutAt: null };
    return {
      rate: data.fixed_rate ? Number(data.fixed_rate) : null,
      name: (data as any).room_name ?? null,
      dayCutAt: (data as any).day_cut_at ?? null,
    };
  } catch {
    return { rate: null, name: null, dayCutAt: null };
  }
}

/** เริ่มวันใหม่ — ตั้งจุดตัดวันของห้องนี้ = ตอนนี้ (ยอดวันนี้เริ่มนับใหม่จากตรงนี้) */
export async function startNewDay(chatId: number): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('chat_settings')
    .upsert({ chat_id: chatId, day_cut_at: now, updated_at: now })
    .then(undefined, () => undefined);
}

/** ตั้งชื่อห้อง (แสดงใน dashboard / ledger แทนเลข chat) */
export async function setRoomName(chatId: number, name: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('chat_settings')
    .upsert({ chat_id: chatId, room_name: name, updated_at: now })
    .then(undefined, () => undefined);
}
