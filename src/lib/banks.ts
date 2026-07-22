// ============================================================
// บัญชีธนาคารที่ปักหมุด "วันนี้" + จับคู่กับสลิปจาก Vision OCR
// ทดแทน slipApi เสียเงิน — ใช้ Grok Vision อ่านยอด/ธนาคาร/เลขท้าย
// แล้วเทียบกับบัญชีที่แอดมิน /pin ไว้สำหรับวันนั้น (Asia/Bangkok)
// ============================================================
import { adminDb } from './firebaseAdmin';

export type BankAccount = {
  id: string;
  label: string;
  bank_name: string;
  account_number: string | null;
  current_balance: number;
  pinned_for_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** วันที่ปัจจุบันตามโซนไทย YYYY-MM-DD */
export function bangkokDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** เวลาปัจจุบันไทย อ่านง่าย */
export function bangkokNowLabel(d = new Date()): string {
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function last4OfAccount(accountNumber: string | null | undefined): string | null {
  if (!accountNumber) return null;
  const digits = String(accountNumber).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** ย่อรหัสธนาคารให้เทียบกันได้ (KBANK / กสิกร / Kasikorn → KBANK) */
export function normalizeBankCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const map: Record<string, string> = {
    KBANK: 'KBANK',
    KASIKORN: 'KBANK',
    KASIKORNBANK: 'KBANK',
    กสิกร: 'KBANK',
    กสิกรไทย: 'KBANK',
    SCB: 'SCB',
    SIAMCOMMERCIAL: 'SCB',
    ไทยพาณิชย์: 'SCB',
    BBL: 'BBL',
    BANGKOKBANK: 'BBL',
    กรุงเทพ: 'BBL',
    KTB: 'KTB',
    KRUNGTHAI: 'KTB',
    กรุงไทย: 'KTB',
    BAY: 'BAY',
    KRUNGSRI: 'BAY',
    กรุงศรี: 'BAY',
    TTB: 'TTB',
    TMB: 'TTB',
    THANACHART: 'TTB',
    ทหารไทยธนชาต: 'TTB',
    GSB: 'GSB',
    ออมสิน: 'GSB',
    KKP: 'KKP',
    KIATNAKIN: 'KKP',
    CIMB: 'CIMB',
    LH: 'LH',
    LANDANDHOUSES: 'LH',
    UOB: 'UOB',
    TISCO: 'TISCO',
  };
  if (map[s]) return map[s];
  for (const [k, v] of Object.entries(map)) {
    if (s.includes(k) || k.includes(s)) return v;
  }
  return s.slice(0, 12);
}

export type SlipBankHint = {
  bank?: string | null;
  last4?: string | null;
  receiverName?: string | null;
};

/**
 * เลขท้ายบัญชีสลิปต้องตรงกับบัญชีที่ปักหมุด
 * ถ้าระบุธนาคารทั้งสองฝั่ง — ต้องตรงด้วย (ถ้าระบุฝั่งเดียว ข้ามการเทียบธนาคาร)
 */
export function matchesPinnedBank(
  slip: SlipBankHint,
  bank: Pick<BankAccount, 'bank_name' | 'account_number'>,
): boolean {
  const slipLast4 = slip.last4?.replace(/\D/g, '').slice(-4) || null;
  const pinLast4 = last4OfAccount(bank.account_number);
  if (!slipLast4 || !pinLast4 || slipLast4 !== pinLast4) return false;

  const slipBank = normalizeBankCode(slip.bank);
  const pinBank = normalizeBankCode(bank.bank_name);
  if (slipBank && pinBank && slipBank !== pinBank) return false;
  return true;
}

function mapDoc(id: string, data: Record<string, unknown>): BankAccount {
  return {
    id,
    label: String(data.label || ''),
    bank_name: String(data.bank_name || ''),
    account_number: data.account_number != null ? String(data.account_number) : null,
    current_balance: Number(data.current_balance || 0),
    pinned_for_date: data.pinned_for_date != null ? String(data.pinned_for_date) : null,
    created_at: data.created_at != null ? String(data.created_at) : undefined,
    updated_at: data.updated_at != null ? String(data.updated_at) : undefined,
  };
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const snap = await adminDb.collection('bank_accounts').orderBy('created_at', 'asc').get();
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
}

/** บัญชีที่ปักหมุดสำหรับวันนี้ (ถ้ามีหลายใบ เอาใบแรก) */
export async function getPinnedBankForToday(today = bangkokDate()): Promise<BankAccount | null> {
  const snap = await adminDb
    .collection('bank_accounts')
    .where('pinned_for_date', '==', today)
    .limit(5)
    .get();
  if (!snap.empty) return mapDoc(snap.docs[0]!.id, snap.docs[0]!.data() as Record<string, unknown>);

  // fallback: ไม่มี composite index / เอกสารเก่า — สแกนทั้งหมด
  const all = await listBankAccounts();
  return all.find((b) => b.pinned_for_date === today) ?? null;
}

export async function getBankById(id: string): Promise<BankAccount | null> {
  const doc = await adminDb.collection('bank_accounts').doc(id).get();
  return doc.exists ? mapDoc(doc.id, doc.data() as Record<string, unknown>) : null;
}

/** หาบัญชีจากเลขท้าย (+ธนาคารถ้ามี) */
export async function findBankByLast4(
  last4: string,
  bankHint?: string | null,
): Promise<BankAccount | null> {
  const want = last4.replace(/\D/g, '').slice(-4);
  if (want.length !== 4) return null;
  const all = await listBankAccounts();
  const hint = normalizeBankCode(bankHint);
  const hits = all.filter((b) => last4OfAccount(b.account_number) === want);
  if (hits.length === 0) return null;
  if (hint) {
    const byBank = hits.find((b) => normalizeBankCode(b.bank_name) === hint);
    if (byBank) return byBank;
  }
  return hits[0]!;
}

/**
 * ปักหมุดบัญชีสำหรับวันนี้
 * - เคลียร์ pin ของวันอื่นบนเอกสารนั้น
 * - เคลียร์ pin วันนี้ของบัญชีอื่น (มีได้ใบเดียว)
 */
export async function pinBankForToday(bankId: string, today = bangkokDate()): Promise<BankAccount> {
  const ref = adminDb.collection('bank_accounts').doc(bankId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('ไม่พบบัญชีธนาคาร');

  const all = await listBankAccounts();
  const batch = adminDb.batch();
  const now = new Date().toISOString();
  for (const b of all) {
    if (b.id === bankId) continue;
    if (b.pinned_for_date === today) {
      batch.update(adminDb.collection('bank_accounts').doc(b.id), {
        pinned_for_date: null,
        updated_at: now,
      });
    }
  }
  batch.update(ref, { pinned_for_date: today, updated_at: now });
  await batch.commit();

  const next = await ref.get();
  return mapDoc(next.id, next.data() as Record<string, unknown>);
}

export async function unpinBank(bankId: string): Promise<void> {
  await adminDb.collection('bank_accounts').doc(bankId).update({
    pinned_for_date: null,
    updated_at: new Date().toISOString(),
  });
}

/** อัปเดตเลขบัญชี / ธนาคาร แล้วปักหมุดวันนี้ (สร้างใหม่ถ้ายังไม่มี) */
export async function upsertAndPinBank(input: {
  bank: string;
  accountNumber: string;
  label?: string;
}): Promise<BankAccount> {
  const last4 = last4OfAccount(input.accountNumber);
  if (!last4) throw new Error('เลขบัญชีต้องมีอย่างน้อย 4 ตัว');
  const bankCode = normalizeBankCode(input.bank) || 'OTHER';
  const existing = await findBankByLast4(last4, bankCode);
  const now = new Date().toISOString();

  if (existing) {
    await adminDb
      .collection('bank_accounts')
      .doc(existing.id)
      .update({
        bank_name: bankCode,
        account_number: input.accountNumber.replace(/\s+/g, ''),
        label: input.label || existing.label || `${bankCode} ••••${last4}`,
        updated_at: now,
      });
    return pinBankForToday(existing.id);
  }

  const { randomUUID } = await import('crypto');
  const id = randomUUID();
  await adminDb
    .collection('bank_accounts')
    .doc(id)
    .set({
      label: input.label || `${bankCode} ••••${last4}`,
      bank_name: bankCode,
      account_number: input.accountNumber.replace(/\s+/g, ''),
      current_balance: 0,
      pinned_for_date: null,
      created_at: now,
      updated_at: now,
    });
  return pinBankForToday(id);
}
