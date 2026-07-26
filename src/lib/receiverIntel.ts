/**
 * Receiver Intelligence — instant profile for last4 / slip
 * Receiver · Transactions · Volume · Last · Risk · Duplicate
 */
import type { ReceiverStats } from './receivers';
import { adminDb } from './firebaseAdmin';

export type RiskLevel = 'LOW' | 'MED' | 'HIGH';

export interface ReceiverIntel {
  bank: string | null;
  last4: string;
  name: string | null;
  transactions: number;
  volumeThb: number;
  lastAt: string | null;
  lastRelative: string;
  risk: RiskLevel;
  duplicate: boolean;
  status: ReceiverStats['status'] | 'new';
  known: boolean; // seen before → can skip cold OCR path
  todayCount: number;
  todayThb: number;
  lastLedgerRef: string | null;
  lastAmountThb: number;
}

/** Compact THB: 1280000 → ฿1.28M */
export function formatVolumeThb(n: number): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}฿${trimZeros((abs / 1_000_000_000).toFixed(2))}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}฿${trimZeros((abs / 1_000_000).toFixed(2))}M`;
  }
  if (abs >= 10_000) {
    return `${sign}฿${Math.round(abs).toLocaleString('en-US')}`;
  }
  return `${sign}฿${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, '');
}

/** "2 hrs ago" / "just now" / "3 days ago" */
export function formatRelativeLast(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const sec = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 48) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function computeRisk(r: Pick<ReceiverStats, 'status' | 'total_transactions'> | null): RiskLevel {
  if (!r) return 'MED';
  if (r.status === 'blacklist') return 'HIGH';
  if (r.status === 'trusted') return 'LOW';
  const n = Number(r.total_transactions) || 0;
  if (n >= 10) return 'LOW';
  if (n >= 3) return 'LOW';
  if (n >= 1) return 'MED';
  return 'MED';
}

export function toReceiverIntel(
  r: ReceiverStats | null,
  last4: string,
  opts?: { duplicate?: boolean },
): ReceiverIntel {
  if (!r) {
    return {
      bank: null,
      last4,
      name: null,
      transactions: 0,
      volumeThb: 0,
      lastAt: null,
      lastRelative: '—',
      risk: 'MED',
      duplicate: !!opts?.duplicate,
      status: 'new',
      known: false,
      todayCount: 0,
      todayThb: 0,
      lastLedgerRef: null,
      lastAmountThb: 0,
    };
  }
  return {
    bank: r.bank,
    last4: r.account_last4 || last4,
    name: r.receiver_name,
    transactions: Number(r.total_transactions) || 0,
    volumeThb: Number(r.total_amount_thb) || 0,
    lastAt: r.last_transaction_at,
    lastRelative: formatRelativeLast(r.last_transaction_at),
    risk: computeRisk(r),
    duplicate: !!opts?.duplicate,
    status: r.status,
    known: (Number(r.total_transactions) || 0) >= 1,
    todayCount: Number(r.todayCount) || 0,
    todayThb: Number(r.todayThb) || 0,
    lastLedgerRef: r.last_ledger_ref,
    lastAmountThb: Number(r.last_amount_thb) || 0,
  };
}

/** Duplicate = same last4 + amount already today (or last amount matches) */
export async function checkReceiverDuplicate(input: {
  last4: string;
  thb?: number | null;
  bank?: string | null;
}): Promise<boolean> {
  const last4 = input.last4.replace(/\D/g, '').slice(-4);
  if (!last4 || input.thb == null || !(input.thb > 0)) return false;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sinceIso = start.toISOString();
    const snap = await adminDb
      .collection('transactions')
      .where('receiver_last4', '==', last4)
      .where('created_at', '>=', sinceIso)
      .limit(40)
      .get();
    const thb = Number(input.thb);
    return snap.docs.some((d) => {
      const row = d.data();
      const amt = Number(row.thb_amount || 0);
      if (Math.abs(amt - thb) > 0.01) return false;
      if (input.bank && row.receiver_bank) {
        return String(row.receiver_bank).toUpperCase() === String(input.bank).toUpperCase();
      }
      return true;
    });
  } catch {
    return false;
  }
}

/** Thai / English “today profit?” natural language */
export function isTodayProfitQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/วันนี้.*(กำไร|profit)/i.test(text)) return true;
  if (/(กำไร|profit).*(วันนี้|today)/i.test(text)) return true;
  if (/^(กำไรวันนี้|today'?s? profit|profit today)\??$/i.test(t)) return true;
  if (/วันนี้กำไรเท่าไหร่|วันนี้กำไรเท่าไร|กำไรเท่าไหร่วันนี้|กำไรเท่าไรวันนี้/i.test(text))
    return true;
  return false;
}

/** Bare last4 query: "3376" or "SCB 3376" */
export function parseLast4Query(text: string): { last4: string; bankHint: string | null } | null {
  const t = text.trim();
  if (!t || t.startsWith('/')) return null;
  // exact 4 digits
  if (/^\d{4}$/.test(t)) return { last4: t, bankHint: null };
  // BANK 3376 / 3376 SCB
  const m1 = t.match(/^([A-Za-zก-๙]{2,12})\s+(\d{4})$/u);
  if (m1) return { last4: m1[2]!, bankHint: m1[1]! };
  const m2 = t.match(/^(\d{4})\s+([A-Za-zก-๙]{2,12})$/u);
  if (m2) return { last4: m2[1]!, bankHint: m2[2]! };
  return null;
}
