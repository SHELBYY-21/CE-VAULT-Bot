// ============================================================
// บัญชีรับเงินที่ปักหมุด "วันนี้" (สูงสุด 3) + จับคู่สลิป Vision OCR
// /pin SCB|kbank|ktb|bbl|tmn <เลขบัญชี>
// ============================================================
import { adminDb } from './firebaseAdmin';

export const MAX_PINNED_TODAY = 3;

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

export class PinLimitError extends Error {
  readonly pinned: BankAccount[];
  constructor(pinned: BankAccount[]) {
    super(`ปักหมุดครบ ${MAX_PINNED_TODAY} บัญชีแล้ว — ลบตัวเดิมด้วย /unpin ก่อนเพิ่มใหม่`);
    this.name = 'PinLimitError';
    this.pinned = pinned;
  }
}

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

/** คำย่อธ. ที่รองรับใน /pin เช่น SCB, kbank, ktb, bbl, tmn */
export const PIN_BANK_ALIASES = [
  'SCB',
  'KBANK',
  'KTB',
  'BBL',
  'TMN',
  'BAY',
  'TTB',
  'GSB',
  'KKP',
  'CIMB',
  'LH',
  'UOB',
] as const;

/** ย่อรหัสธนาคารให้เทียบกันได้ (case-insensitive) */
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
    // TrueMoney Wallet
    TMN: 'TMN',
    TRUEMONEY: 'TMN',
    TRUE: 'TMN',
    ทรูมันนี่: 'TMN',
    ทรู: 'TMN',
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
 * ถ้าระบุธนาคารทั้งสองฝั่ง — ต้องตรงด้วย
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

/** หาบัญชีปักหมุดใบแรกที่สลิปตรง (จากรายการสูงสุด 3) */
export function findMatchingPinnedBank(
  slip: SlipBankHint,
  banks: Pick<BankAccount, 'id' | 'bank_name' | 'account_number' | 'label'>[],
): (typeof banks)[number] | null {
  for (const b of banks) {
    if (matchesPinnedBank(slip, b)) return b;
  }
  return null;
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

/** บัญชีที่ปักหมุดวันนี้ทั้งหมด (สูงสุด 3) */
export async function listPinnedBanksForToday(today = bangkokDate()): Promise<BankAccount[]> {
  try {
    const snap = await adminDb
      .collection('bank_accounts')
      .where('pinned_for_date', '==', today)
      .limit(MAX_PINNED_TODAY + 2)
      .get();
    if (!snap.empty) {
      return snap.docs
        .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
        .slice(0, MAX_PINNED_TODAY);
    }
  } catch {
    /* อาจไม่มี index — สแกนทั้งหมด */
  }
  const all = await listBankAccounts();
  return all.filter((b) => b.pinned_for_date === today).slice(0, MAX_PINNED_TODAY);
}

/** ใบแรก (backward compat) */
export async function getPinnedBankForToday(today = bangkokDate()): Promise<BankAccount | null> {
  const list = await listPinnedBanksForToday(today);
  return list[0] ?? null;
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
 * ปักหมุดบัญชีสำหรับวันนี้ (สูงสุด 3 พร้อมกัน)
 * - ถ้าบัญชีนี้อยู่ในรายการปักหมุดอยู่แล้ว → อัปเดตวันแล้วคืนค่า (ไม่นับเพิ่ม)
 * - ถ้าครบ 3 แล้วและเป็นบัญชีใหม่ → PinLimitError
 */
export async function pinBankForToday(bankId: string, today = bangkokDate()): Promise<BankAccount> {
  const ref = adminDb.collection('bank_accounts').doc(bankId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('ไม่พบบัญชีธนาคาร');

  const pinned = await listPinnedBanksForToday(today);
  const already = pinned.find((b) => b.id === bankId);
  if (already) {
    await ref.update({ pinned_for_date: today, updated_at: new Date().toISOString() });
    const next = await ref.get();
    return mapDoc(next.id, next.data() as Record<string, unknown>);
  }

  if (pinned.length >= MAX_PINNED_TODAY) {
    throw new PinLimitError(pinned);
  }

  await ref.update({ pinned_for_date: today, updated_at: new Date().toISOString() });
  const next = await ref.get();
  return mapDoc(next.id, next.data() as Record<string, unknown>);
}

export async function unpinBank(bankId: string): Promise<void> {
  await adminDb.collection('bank_accounts').doc(bankId).update({
    pinned_for_date: null,
    updated_at: new Date().toISOString(),
  });
}

/** ยกเลิกปักหมุดตามเลขท้าย (+ธนาคาร optional) ในรายการวันนี้ */
export async function unpinPinnedByHint(
  hint: { last4?: string | null; bank?: string | null; index?: number | null },
  today = bangkokDate(),
): Promise<BankAccount | null> {
  const pinned = await listPinnedBanksForToday(today);
  if (pinned.length === 0) return null;

  if (hint.index != null && hint.index >= 1 && hint.index <= pinned.length) {
    const b = pinned[hint.index - 1]!;
    await unpinBank(b.id);
    return b;
  }

  const last4 = hint.last4?.replace(/\D/g, '').slice(-4) || null;
  const bank = normalizeBankCode(hint.bank);
  const hit = pinned.find((b) => {
    const okLast = !last4 || last4OfAccount(b.account_number) === last4;
    const okBank = !bank || normalizeBankCode(b.bank_name) === bank;
    return okLast && okBank;
  });
  if (!hit) return null;
  await unpinBank(hit.id);
  return hit;
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
