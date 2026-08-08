import { describe, expect, it } from 'vitest';
import {
  computeRisk,
  formatRelativeLast,
  formatVolumeThb,
  isTodayProfitQuestion,
  parseLast4Query,
  toReceiverIntel,
} from '../receiverIntel';
import type { ReceiverStats } from '../receivers';

describe('formatVolumeThb', () => {
  it('formats millions like ฿1.28M', () => {
    expect(formatVolumeThb(1_280_000)).toBe('฿1.28M');
  });
});

describe('formatRelativeLast', () => {
  it('renders hours ago', () => {
    const now = new Date('2026-07-26T15:00:00+07:00');
    const iso = '2026-07-26T13:00:00+07:00';
    expect(formatRelativeLast(iso, now)).toBe('2 hrs ago');
  });
});

describe('computeRisk / toReceiverIntel', () => {
  it('marks trusted / high-history as LOW', () => {
    expect(computeRisk({ status: 'trusted', total_transactions: 5 })).toBe('LOW');
    expect(computeRisk({ status: 'normal', total_transactions: 52 })).toBe('LOW');
    expect(computeRisk({ status: 'blacklist', total_transactions: 99 })).toBe('HIGH');
  });

  it('builds intel for known SCB 3376', () => {
    const row = {
      id: 'r1',
      bank: 'SCB',
      receiver_name: 'Test',
      account_last4: '3376',
      total_transactions: 52,
      total_amount_thb: 1_280_000,
      total_usdt: 0,
      max_amount_thb: 50_000,
      last_amount_thb: 5000,
      first_transaction_at: null,
      last_transaction_at: '2026-07-26T13:00:00+07:00',
      last_ledger_ref: 'CE-1',
      status: 'trusted',
    } as ReceiverStats;
    const intel = toReceiverIntel(row, '3376');
    expect(intel.known).toBe(true);
    expect(intel.risk).toBe('LOW');
    expect(intel.transactions).toBe(52);
    expect(formatVolumeThb(intel.volumeThb)).toBe('฿1.28M');
  });
});

describe('parseLast4Query / profit NL', () => {
  it('parses bare last4 and bank hint', () => {
    expect(parseLast4Query('3376')).toEqual({ last4: '3376', bankHint: null });
    expect(parseLast4Query('SCB 3376')).toEqual({ last4: '3376', bankHint: 'SCB' });
    expect(parseLast4Query('/receiver 3376')).toBeNull();
  });

  it('detects today profit questions', () => {
    expect(isTodayProfitQuestion('วันนี้กำไรเท่าไร')).toBe(true);
    expect(isTodayProfitQuestion('วันนี้กำไรเท่าไหร่')).toBe(true);
    expect(isTodayProfitQuestion('today profit')).toBe(true);
    expect(isTodayProfitQuestion('3376')).toBe(false);
  });
});
