import { describe, expect, it } from 'vitest';
import {
  computeTodayKpis,
  formatCompactThb,
  isBangkokToday,
} from '../dashboardToday';
import type { Admin, Transaction } from '../../types/transactions';

function tx(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    admin_id: 'a1',
    type: 'THB_DEPOSIT',
    thb_amount: 0,
    usdt_amount: 0,
    sell_rate: 36,
    cost_per_unit: 34,
    sell_value_thb: 0,
    net_profit_thb: 0,
    profit_percent: 0,
    expected_usdt: 0,
    fee_usdt: 0,
    fee_percent: 0,
    created_at: '2026-07-26T08:00:00+07:00',
    status: 'waiting_admin',
    ...partial,
  };
}

describe('formatCompactThb', () => {
  it('formats millions like ฿2.48M', () => {
    expect(formatCompactThb(2_480_000)).toBe('฿2.48M');
  });

  it('formats mid thousands with commas', () => {
    expect(formatCompactThb(39_000)).toBe('฿39,000');
  });
});

describe('isBangkokToday', () => {
  it('matches Bangkok calendar day', () => {
    const now = new Date('2026-07-26T15:00:00+07:00');
    expect(isBangkokToday('2026-07-26T01:00:00+07:00', now)).toBe(true);
    expect(isBangkokToday('2026-07-25T23:00:00+07:00', now)).toBe(false);
  });
});

describe('computeTodayKpis', () => {
  it('aggregates volume, status counts, profit, wallet', () => {
    const now = new Date('2026-07-26T15:00:00+07:00');
    const transactions: Transaction[] = [
      tx({
        id: '1',
        thb_amount: 2_000_000,
        net_profit_thb: 30_000,
        status: 'completed',
      }),
      tx({
        id: '2',
        thb_amount: 480_000,
        net_profit_thb: 9_000,
        status: 'waiting_admin',
      }),
      tx({
        id: '3',
        thb_amount: 10_000,
        net_profit_thb: 100,
        status: 'ocr_success',
      }),
      tx({
        id: 'old',
        thb_amount: 999_999,
        net_profit_thb: 999,
        status: 'completed',
        created_at: '2026-07-25T10:00:00+07:00',
      }),
    ];
    const admins: Admin[] = [
      { id: 'a1', name: 'A', telegram_user_id: 1, holding_usdt: 10_000 },
      { id: 'a2', name: 'B', telegram_user_id: 2, holding_usdt: 5_099 },
    ];

    const kpis = computeTodayKpis(transactions, admins, now);
    expect(kpis.date).toBe('2026-07-26');
    expect(kpis.volumeThb).toBe(2_490_000);
    expect(kpis.transactions).toBe(3);
    expect(kpis.waiting).toBe(2);
    expect(kpis.completed).toBe(1);
    expect(kpis.profitThb).toBe(39_100);
    expect(kpis.walletUsdt).toBe(15_099);
  });
});
