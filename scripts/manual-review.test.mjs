import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseManualReviewCommand,
  validateManualReviewGate,
} from '../runtime-patches/manual-review.mjs';

test('manual review parses REF amount bank and last4 without using JS Number for money', () => {
  assert.deepEqual(
    parseManualReviewCommand('/review CE-20261006-ABC123 50000.25 KBANK 0343'),
    {
      ledgerRef: 'CE-20261006-ABC123',
      amount: '50000.25',
      bank: 'KBANK',
      last4: '0343',
    },
  );
});

test('manual review rejects malformed amount and account suffix', () => {
  assert.throws(() => parseManualReviewCommand('/review CE-20261006-ABC123 50k KBANK 0343'), /MANUAL_REVIEW_AMOUNT_INVALID/);
  assert.throws(() => parseManualReviewCommand('/review CE-20261006-ABC123 50000 KBANK 34'), /MANUAL_REVIEW_LAST4_INVALID/);
});

test('manual review only allows reviewable pending states', () => {
  const common = {
    bank: 'KBANK',
    last4: '0343',
    pinnedBanks: [{ id: 'bank-1', bank_name: 'KBANK', account_number: '1234560343' }],
    deskRate: { sell_rate: '37.1234' },
    market: { fresh: true, price: '33.62' },
  };

  assert.equal(validateManualReviewGate({ ...common, pending: { status: 'OCR_FAILED', tx_id: null } }).ok, true);
  assert.equal(validateManualReviewGate({ ...common, pending: { status: 'NEEDS_REVIEW', tx_id: null } }).ok, true);
  assert.equal(validateManualReviewGate({ ...common, pending: { status: 'RECORDED', tx_id: 'tx-1' } }).code, 'MANUAL_REVIEW_ALREADY_RECORDED');
});

test('manual review fails closed on PIN mismatch, missing desk rate, or stale market', () => {
  const base = {
    pending: { status: 'OCR_FAILED', tx_id: null },
    bank: 'KBANK',
    last4: '0343',
    pinnedBanks: [{ id: 'bank-1', bank_name: 'KBANK', account_number: '1234560343' }],
    deskRate: { sell_rate: '37.1234' },
    market: { fresh: true, price: '33.62' },
  };

  assert.equal(validateManualReviewGate({ ...base, last4: '9999' }).code, 'MANUAL_REVIEW_PIN_MISMATCH');
  assert.equal(validateManualReviewGate({ ...base, deskRate: null }).code, 'MANUAL_REVIEW_RATE_REQUIRED');
  assert.equal(validateManualReviewGate({ ...base, market: { fresh: false, price: '33.62' } }).code, 'MANUAL_REVIEW_MARKET_UNAVAILABLE');
});
