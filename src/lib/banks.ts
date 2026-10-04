// ============================================================
// บัญชีรับเงินที่ปักหมุด "วันนี้" (สูงสุด 3) + จับคู่สลิป Vision OCR
// /pin SCB|kbank|ktb|bbl|tmn <เลขบัญชี>
// ============================================================
import { createSupabaseAdminClient } from './supabase/admin';
const db = () => createSupabaseAdminClient();
function checked(error: {message:string}|null){if(error)throw new Error(error.message);}


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
 const {data,error}=await db().from('bank_accounts').select('*').order('created_at',{ascending:true});checked(error);
 return (data??[]).map(r=>mapDoc(r.id,r));
}
export async function listPinnedBanksForToday(today=bangkokDate()):Promise<BankAccount[]> {
 const {data,error}=await db().from('bank_accounts').select('*').eq('pinned_for_date',today).order('created_at',{ascending:true}).limit(MAX_PINNED_TODAY);checked(error);
 return (data??[]).map(r=>mapDoc(r.id,r));
}
export async function getPinnedBankForToday(today=bangkokDate()):Promise<BankAccount|null>{
 return (await listPinnedBanksForToday(today))[0]??null;
}
export async function getBankById(id:string):Promise<BankAccount|null>{
 const {data,error}=await db().from('bank_accounts').select('*').eq('id',id).maybeSingle();checked(error);
 return data?mapDoc(data.id,data):null;
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
export async function pinBankForToday(bankId:string,today=bangkokDate()):Promise<BankAccount>{
 const bank=await getBankById(bankId);if(!bank)throw new Error('ไม่พบบัญชีธนาคาร');
 const pinned=await listPinnedBanksForToday(today);
 if(!pinned.some(b=>b.id===bankId)&&pinned.length>=MAX_PINNED_TODAY)throw new PinLimitError(pinned);
 const {error}=await db().from('bank_accounts').update({pinned_for_date:today,updated_at:new Date().toISOString()}).eq('id',bankId);checked(error);
 return (await getBankById(bankId))!;
}
export async function unpinBank(bankId:string):Promise<void>{
 const {error}=await db().from('bank_accounts').update({pinned_for_date:null,updated_at:new Date().toISOString()}).eq('id',bankId);checked(error);
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
export async function upsertAndPinBank(input:{bank:string;accountNumber:string;label?:string}):Promise<BankAccount>{
 const last4=last4OfAccount(input.accountNumber);if(!last4)throw new Error('เลขบัญชีต้องมีอย่างน้อย 4 ตัว');
 const bankCode=normalizeBankCode(input.bank)||'OTHER';const existing=await findBankByLast4(last4,bankCode);
 const row={bank_name:bankCode,account_number:input.accountNumber.replace(/\s+/g,''),label:input.label||existing?.label||`${bankCode} ••••${last4}`,updated_at:new Date().toISOString()};
 if(existing){const {error}=await db().from('bank_accounts').update(row).eq('id',existing.id);checked(error);return pinBankForToday(existing.id);}
 const {data,error}=await db().from('bank_accounts').insert(row).select('id').single();checked(error);
 if(!data)throw new Error('Bank insert returned no ID');return pinBankForToday(data.id);
}
