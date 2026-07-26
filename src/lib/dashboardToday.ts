/**
 * Financial Dashboard — Today KPIs
 * Volume · Transactions · Waiting · Completed · Profit · Wallet
 */
import { bangkokDate } from './banks';
import {
  normalizeTransactionStatus,
  type Admin,
  type Transaction,
  type TransactionStatus,
} from '../types/transactions';

export interface TodayKpis {
  date: string; // YYYY-MM-DD (Asia/Bangkok)
  volumeThb: number;
  transactions: number;
  waiting: number;
  completed: number;
  profitThb: number;
  walletUsdt: number;
}

export function bangkokDayStartIso(d = new Date()): string {
  return `${bangkokDate(d)}T00:00:00+07:00`;
}

export function isBangkokToday(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  try {
    return bangkokDate(new Date(iso)) === bangkokDate(now);
  } catch {
    return false;
  }
}

/** Compact THB: 2480000 → "฿2.48M", 39000 → "฿39,000" */
export function formatCompactThb(n: number): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}฿${(abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}฿${(abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  if (abs >= 10_000) {
    return `${sign}฿${Math.round(abs).toLocaleString('en-US')}`;
  }
  return `${sign}฿${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatUsdt(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function isWaiting(status: TransactionStatus): boolean {
  return status === 'waiting_admin' || status === 'ocr_success';
}

export function computeTodayKpis(
  transactions: Transaction[],
  admins: Admin[],
  now = new Date(),
): TodayKpis {
  const today = transactions.filter((t) => isBangkokToday(t.created_at, now));
  let volumeThb = 0;
  let profitThb = 0;
  let waiting = 0;
  let completed = 0;

  for (const t of today) {
    const status = normalizeTransactionStatus(t.status);
    if (status === 'completed') completed += 1;
    else if (isWaiting(status)) waiting += 1;

    if (t.type === 'THB_DEPOSIT') {
      volumeThb += Number(t.thb_amount) || 0;
      profitThb += Number(t.net_profit_thb) || 0;
    }
  }

  const walletUsdt = admins.reduce((s, a) => s + (Number(a.holding_usdt) || 0), 0);

  return {
    date: bangkokDate(now),
    volumeThb,
    transactions: today.length,
    waiting,
    completed,
    profitThb,
    walletUsdt,
  };
}
