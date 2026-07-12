// ============================================================
// Receiver History — จำบัญชีผู้รับ (ธนาคาร + เลข 4 ตัวท้าย) พร้อมสถิติสะสม
// ตัวระบุหลัก account_hash = sha256("<BANK>|<last4>") — ถ้าอนาคต OCR ได้เลขเต็ม
// เปลี่ยนไป hash เลขเต็มได้โดย schema ไม่ต้องแก้
// degrade เงียบถ้ายังไม่ได้รัน patch-v3 (ตาราง receivers ไม่มี)
// ============================================================
import { createHash } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

export interface ReceiverStats {
  id: string;
  bank: string | null;
  receiver_name: string | null;
  account_last4: string;
  total_transactions: number;
  total_amount_thb: number;
  total_usdt: number;
  max_amount_thb: number;
  last_amount_thb: number;
  first_transaction_at: string | null;
  last_transaction_at: string | null;
  last_ledger_ref: string | null;
  status: 'normal' | 'trusted' | 'blacklist';
  todayCount?: number;
  todayThb?: number;
}

export function receiverHash(bank: string | null | undefined, last4: string): string {
  return createHash('sha256').update(`${(bank || 'UNKNOWN').toUpperCase()}|${last4}`).digest('hex');
}

/** ดึงประวัติผู้รับ (+สถิติวันนี้) — null ถ้าไม่เคยมี/ตารางยังไม่มี */
export async function getReceiver(
  bank: string | null | undefined,
  last4: string,
): Promise<ReceiverStats | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('receivers')
      .select('*')
      .eq('account_hash', receiverHash(bank, last4))
      .maybeSingle();
    if (error || !data) return null;

    // สถิติวันนี้จาก transactions ที่ผูก receiver_id
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: today } = await supabaseAdmin
      .from('transactions')
      .select('thb_amount')
      .eq('receiver_id', data.id)
      .gte('created_at', start.toISOString());
    const rows = today ?? [];
    return {
      ...(data as ReceiverStats),
      todayCount: rows.length,
      todayThb: rows.reduce((s, r: any) => s + Number(r.thb_amount || 0), 0),
    };
  } catch {
    return null;
  }
}

/** ค้นด้วยเลข 4 ตัวท้ายอย่างเดียว (สำหรับ /receiver 6578) — คืนหลายแบงก์ถ้าซ้ำ */
export async function findReceiversByLast4(last4: string): Promise<ReceiverStats[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('receivers')
      .select('*')
      .eq('account_last4', last4)
      .order('total_amount_thb', { ascending: false });
    if (error) return [];
    return (data ?? []) as ReceiverStats[];
  } catch {
    return [];
  }
}

/** บันทึก/สะสมสถิติผู้รับหลังฝากสำเร็จ — คืน receiver id (null ถ้า degrade) */
export async function upsertReceiverOnDeposit(input: {
  bank: string | null;
  last4: string;
  receiverName: string | null;
  thb: number;
  usdt: number;
  ledgerRef: string;
}): Promise<string | null> {
  try {
    const hash = receiverHash(input.bank, input.last4);
    const now = new Date().toISOString();
    const { data: old } = await supabaseAdmin
      .from('receivers')
      .select('*')
      .eq('account_hash', hash)
      .maybeSingle();

    if (!old) {
      const { data: created, error } = await supabaseAdmin
        .from('receivers')
        .insert({
          account_hash: hash,
          bank: input.bank,
          receiver_name: input.receiverName,
          account_last4: input.last4,
          total_transactions: 1,
          total_amount_thb: input.thb,
          total_usdt: input.usdt,
          max_amount_thb: input.thb,
          last_amount_thb: input.thb,
          first_transaction_at: now,
          last_transaction_at: now,
          last_ledger_ref: input.ledgerRef,
        })
        .select('id')
        .single();
      if (error) return null;
      return created?.id ?? null;
    }

    await supabaseAdmin
      .from('receivers')
      .update({
        // เก็บชื่อล่าสุดถ้า OCR อ่านได้ (ชื่ออาจอ่านไม่ได้บางสลิป)
        receiver_name: input.receiverName || old.receiver_name,
        bank: input.bank || old.bank,
        total_transactions: Number(old.total_transactions) + 1,
        total_amount_thb: Number(old.total_amount_thb) + input.thb,
        total_usdt: Number(old.total_usdt) + input.usdt,
        max_amount_thb: Math.max(Number(old.max_amount_thb), input.thb),
        last_amount_thb: input.thb,
        last_transaction_at: now,
        last_ledger_ref: input.ledgerRef,
        // ≥20 รายการ = Trusted อัตโนมัติ (ยกเว้นถูกตั้ง blacklist ไว้)
        status: old.status === 'blacklist' ? 'blacklist' : Number(old.total_transactions) + 1 >= 20 ? 'trusted' : old.status,
      })
      .eq('id', old.id);
    return old.id;
  } catch {
    return null;
  }
}
