// ============================================================
// จัดการสถานะสนทนาต่อผู้ใช้ + chat-level settings (per-group rate)
// ============================================================
import { supabaseAdmin } from './supabaseAdmin';

export type SessionState = 'AWAITING_NAME' | 'AWAITING_AMOUNT' | 'EDITING';

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

export async function setChatRate(chatId: number, rate: number): Promise<void> {
  await supabaseAdmin
    .from('chat_settings')
    .upsert({ chat_id: chatId, fixed_rate: rate, updated_at: new Date().toISOString() })
    .then(undefined, () => undefined);
}
