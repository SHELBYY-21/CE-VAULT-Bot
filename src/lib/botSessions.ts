// ============================================================
// จัดการสถานะสนทนาต่อผู้ใช้ + chat-level settings (per-group rate)
// ============================================================
import { adminDb } from './firebaseAdmin';

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
  ocr_conf?: number | null;
  ledger_ref?: string | null;
  pending_usdt?: number | null;
  usdt_network?: string | null;
  usdt_txid?: string | null;
  usdt_image_url?: string | null;
  admin_id?: string | null;
  admin_name?: string | null;
}

function sessionDocId(chatId: number, userId: number) {
  return `${chatId}_${userId}`;
}

export async function getSession(chatId: number, userId: number): Promise<BotSession | null> {
  const doc = await adminDb.collection('bot_sessions').doc(sessionDocId(chatId, userId)).get();
  if (!doc.exists) return null;
  return doc.data() as BotSession;
}

export async function setSession(
  chatId: number,
  userId: number,
  patch: Partial<Omit<BotSession, 'chat_id' | 'telegram_user_id'>>,
): Promise<void> {
  const full = {
    chat_id: chatId,
    telegram_user_id: userId,
    state: patch.state,
    pending_type: patch.pending_type ?? null,
    slip_url: patch.slip_url ?? null,
    caption: patch.caption ?? null,
    ocr_thb: patch.ocr_thb ?? null,
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
    updated_at: new Date().toISOString(),
  };
  try {
    await adminDb.collection('bot_sessions').doc(sessionDocId(chatId, userId)).set(full, { merge: true });
  } catch (e) {
    console.error(
      `[setSession] เขียน session ไม่สำเร็จ (chat=${chatId}, user=${userId}):`,
      e instanceof Error ? e.message : e,
    );
  }
}

export async function clearSession(chatId: number, userId: number): Promise<void> {
  await adminDb.collection('bot_sessions').doc(sessionDocId(chatId, userId)).delete();
}

export async function getChatRate(chatId: number): Promise<number | null> {
  try {
    const doc = await adminDb.collection('chat_settings').doc(String(chatId)).get();
    if (!doc.exists) return null;
    const rate = doc.data()?.fixed_rate;
    return rate ? Number(rate) : null;
  } catch {
    return null;
  }
}

export async function setChatRate(chatId: number, rate: number, roomName?: string | null): Promise<void> {
  const row: Record<string, unknown> = {
    chat_id: chatId,
    fixed_rate: rate,
    updated_at: new Date().toISOString(),
  };
  if (roomName) row.room_name = roomName;
  await adminDb
    .collection('chat_settings')
    .doc(String(chatId))
    .set(row, { merge: true })
    .catch(() => undefined);
}

export async function getRoom(
  chatId: number,
): Promise<{ rate: number | null; name: string | null; dayCutAt: string | null }> {
  try {
    const doc = await adminDb.collection('chat_settings').doc(String(chatId)).get();
    if (!doc.exists) return { rate: null, name: null, dayCutAt: null };
    const data = doc.data()!;
    return {
      rate: data.fixed_rate ? Number(data.fixed_rate) : null,
      name: data.room_name ?? null,
      dayCutAt: data.day_cut_at ?? null,
    };
  } catch {
    return { rate: null, name: null, dayCutAt: null };
  }
}

export async function startNewDay(chatId: number): Promise<void> {
  const now = new Date().toISOString();
  await adminDb
    .collection('chat_settings')
    .doc(String(chatId))
    .set({ chat_id: chatId, day_cut_at: now, updated_at: now }, { merge: true })
    .catch(() => undefined);
}

export async function setRoomName(chatId: number, name: string): Promise<void> {
  const now = new Date().toISOString();
  await adminDb
    .collection('chat_settings')
    .doc(String(chatId))
    .set({ chat_id: chatId, room_name: name, updated_at: now }, { merge: true })
    .catch(() => undefined);
}
