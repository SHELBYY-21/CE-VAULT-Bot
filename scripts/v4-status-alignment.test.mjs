import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V4 response contract must map 1:1 to the real production pipeline statuses
// (pending_slips.status — same titles as runtime-patches/live-intake.mjs formatIntakeV4Reply)
// and to the canonical DUE convention (docs/settlement-delta-convention.md).

const response = readFileSync(new URL('../src/lib/ceVaultResponse.ts', import.meta.url), 'utf8');

const blockOf = (status) =>
  response.slice(response.indexOf(`  ${status}: {`), response.indexOf('\n  },', response.indexOf(`  ${status}: {`)));

test('STATUS_MAP covers every real production intake status 1:1', () => {
  const realStatuses = [
    'OCR_FAILED', 'BANK_MISMATCH', 'STALE_SLIP', 'NEEDS_REVIEW',
    'PIN_REQUIRED', 'RATE_REQUIRED', 'MARKET_UNAVAILABLE', 'PROMOTION_FAILED', 'VERIFIED',
  ];
  for (const s of realStatuses) {
    assert.ok(response.includes(`  ${s}: {`), `missing STATUS_MAP entry: ${s}`);
  }
});

test('BANK_MISMATCH and STALE_SLIP map to MATCH failed', () => {
  for (const s of ['BANK_MISMATCH', 'STALE_SLIP']) {
    assert.match(blockOf(s), /MATCH: 'failed'/);
  }
});

test('review/pin/rate/market gates hold MATCH current — never claim done', () => {
  for (const s of ['NEEDS_REVIEW', 'PIN_REQUIRED', 'RATE_REQUIRED', 'MARKET_UNAVAILABLE']) {
    assert.match(blockOf(s), /MATCH: 'current'/);
  }
});

test('VERIFIED maps to MATCH done + IN current — ready to record, never settled', () => {
  const b = blockOf('VERIFIED');
  assert.match(b, /MATCH: 'done'/);
  assert.match(b, /IN: 'current'/);
});

test('PROMOTION_FAILED maps to IN failed and warns before retry', () => {
  const b = blockOf('PROMOTION_FAILED');
  assert.match(b, /IN: 'failed'/);
  assert.match(b, /ตรวจ Ledger ก่อน retry/);
});

test('OCR_FAILED never shows a stage trace it cannot support', () => {
  const b = blockOf('OCR_FAILED');
  assert.match(b, /OCR: 'failed'/);
  assert.match(b, /traceFrom: false/);
});

test('DUE renders caller-supplied positive-owed amount per canonical convention', () => {
  assert.match(response, /data\.dueUsdt !== null && data\.dueUsdt !== undefined/);
  assert.match(response, /💎 DUE \$\{fmt\(data\.dueUsdt, 6\)\} USDT/);
  assert.match(response, /dueUsdt = expectedUsdt − sentUsdt/);
});
