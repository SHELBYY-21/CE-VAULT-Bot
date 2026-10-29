import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimal, subtractDecimal, sumDecimals, buildOpsOverview } from '../server/ops-summary.mjs';

test('exact decimal helpers do not lose precision', () => {
  assert.equal(addDecimal('0.1', '0.2'), '0.3');
  assert.equal(subtractDecimal('1000000000000000000.000001', '0.000001'), '1000000000000000000');
  assert.equal(sumDecimals(['0.1', '0.2', '999999999999999999.7']), '1000000000000000000');
});

test('overview uses Asia/Bangkok business date and exact financial sums', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T01:00:00Z',
    transactions: [
      { type: 'THB_DEPOSIT', thb_amount: '100.10', expected_usdt: '3.1', sent_usdt: '1.05', created_at: '2026-10-05T18:30:00Z', is_reversed: false },
      { type: 'THB_DEPOSIT', thb_amount: '0.20', expected_usdt: '1.2', sent_usdt: '1.2', created_at: '2026-10-05T19:00:00Z', is_reversed: false },
      { type: 'THB_DEPOSIT', thb_amount: '999', expected_usdt: '9', sent_usdt: '9', created_at: '2026-10-05T16:00:00Z', is_reversed: false },
    ],
  });
  assert.equal(data.business_date, '2026-10-06');
  assert.equal(data.kpis.thb_in, '100.3');
  assert.equal(data.kpis.sent_usdt, '2.25');
  assert.equal(data.kpis.pending_usdt, '2.05');
  assert.equal(data.kpis.transactions, 2);
});

test('reversed rows are excluded from current-day totals', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T01:00:00Z',
    transactions: [{ type: 'THB_DEPOSIT', thb_amount: '500', expected_usdt: '10', sent_usdt: '0', created_at: '2026-10-05T19:00:00Z', is_reversed: true }],
  });
  assert.equal(data.kpis.thb_in, '0');
  assert.equal(data.kpis.pending_usdt, '0');
  assert.equal(data.kpis.transactions, 0);
});

test('board response keeps ledger references masked but returns sourced full bank account numbers', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T01:00:00Z',
    transactions: [{ ledger_ref: 'CE-20261006-123456', type: 'THB_DEPOSIT', thb_amount: '1', expected_usdt: '0', sent_usdt: '0', created_at: '2026-10-05T19:00:00Z' }],
    bankAccounts: [{ label: 'Primary', bank_name: 'Bank', account_number: '1234567890', current_balance: '1.25' }],
  });
  assert.equal(data.recent_transactions[0].reference, '••••3456');
  assert.equal(data.banks[0].account_number, '1234567890');
  assert.equal(data.kpis.bank_balance_thb, '1.25');
});

test('empty production tables produce honest zero state', () => {
  const data = buildOpsOverview({ now: '2026-10-06T01:00:00Z' });
  assert.deepEqual(data.kpis, { thb_in: '0', sent_usdt: '0', pending_usdt: '0', transactions: 0, pending_slips: 0, open_exceptions: 0, stale_slips: 0, bank_balance_thb: '0' });
  assert.equal(data.recent_transactions.length, 0);
  assert.equal(data.pending_slips.length, 0);
  assert.equal(data.exceptions_detail.length, 0);
  assert.equal(data.hourly_cashflow.length, 12);
});

test('hourly cashflow groups by Bangkok hour with exact decimals', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T12:30:00Z',
    transactions: [
      { type: 'THB_DEPOSIT', thb_amount: '100.10', expected_usdt: '3', sent_usdt: '1', created_at: '2026-10-06T11:00:00Z', is_reversed: false },
      { type: 'THB_DEPOSIT', thb_amount: '0.20', expected_usdt: '1', sent_usdt: '1', created_at: '2026-10-06T10:30:00Z', is_reversed: false },
      { type: 'THB_DEPOSIT', thb_amount: '777', expected_usdt: '20', sent_usdt: '20', created_at: '2026-10-05T09:00:00Z', is_reversed: false },
    ],
  });
  const buckets = data.hourly_cashflow;
  assert.equal(buckets.length, 12);
  const hour18 = buckets.find((b) => b.hour_label === '18:00');
  assert.equal(hour18.thb_in, '100.1');
  assert.equal(hour18.usdt_sent, '1');
  const hour17 = buckets.find((b) => b.hour_label === '17:00');
  assert.equal(hour17.thb_in, '0.2');
  const totalThb = buckets.reduce((sum, b) => addDecimal(sum, b.thb_in), '0');
  assert.equal(totalThb, '100.3');
});

test('exceptions detail carries type, status and age in minutes', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T12:30:00Z',
    exceptions: [
      { status: 'OPEN', exception_type: 'SETTLEMENT_SHORT', created_at: '2026-10-06T12:00:00Z' },
      { status: 'OPEN', exception_type: 'BANK_MATCH_MISSING', created_at: null },
    ],
  });
  assert.equal(data.exceptions_detail.length, 2);
  assert.equal(data.exceptions_detail[0].exception_type, 'SETTLEMENT_SHORT');
  assert.equal(data.exceptions_detail[0].age_minutes, 30);
  assert.equal(data.exceptions_detail[1].exception_type, 'BANK_MATCH_MISSING');
  assert.equal(data.exceptions_detail[1].age_minutes, null);
});
