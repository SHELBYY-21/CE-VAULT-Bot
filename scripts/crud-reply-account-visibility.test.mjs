import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = await import('../runtime-patches/live-intake.mjs');

test('runtime intake reply follows legacy CRUD card structure and shows sourced full account data', () => {
  const reply = runtime.formatIntakeReply({
    pending: {
      ledger_ref: 'CE-20261008-CRUD',
      status: 'VERIFIED',
      thb_in: '10000',
      should_send: '232.56',
      bank: 'KBANK',
      account_number: '123-4-56789-0',
      account_masked: '••••7890',
      name: 'นาย สมชาย ใจดี',
      pin_match: true,
      ocr_confidence: '98.7',
    },
    deskRate: { sell_rate: '43.00' },
    market: { price: '42.80' },
  });

  assert.match(reply, /◈ CE · VERIFY/);
  assert.match(reply, /━━━━━━━━━━━━━━/);
  assert.match(reply, /📥\s+10,000\.00 THB/);
  assert.match(reply, /💎\s+232\.56 USDT/);
  assert.match(reply, /🏦\s+KBANK · 123-4-56789-0/);
  assert.match(reply, /👤\s+นาย สมชาย ใจดี/);
  assert.match(reply, /💱\s+RATE 43\.00/);
  assert.match(reply, /🟢 OCR 98\.7%/);
  assert.match(reply, /🟢 BANK MATCH/);
  assert.match(reply, /STATUS/);
});

test('runtime never invents a full account number when only slip last4 exists', () => {
  const reply = runtime.formatIntakeReply({
    pending: {
      ledger_ref: 'CE-LAST4',
      status: 'BANK_MISMATCH',
      thb_in: '5000',
      bank: 'SCB',
      account_masked: '••••3855',
      name: 'ผู้รับจริง',
      pin_match: false,
      ocr_confidence: '96',
    },
    pinnedAccount: {
      bank_name: 'KBANK',
      account_number: '987-6-54321-0',
      label: 'บัญชีหลัก',
    },
  });

  assert.match(reply, /บัญชีในสลิป/);
  assert.match(reply, /SCB · ••••3855/);
  assert.match(reply, /บัญชี PIN วันนี้/);
  assert.match(reply, /KBANK · 987-6-54321-0/);
  assert.doesNotMatch(reply, /3855\D*3855/);
});

test('generated Telegram pin UI exposes stored full account numbers to operators', () => {
  const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  assert.match(helpers, /function fullBank/);
  assert.doesNotMatch(helpers, /function maskedBank/);
  assert.match(helpers, /account\.account_number/);
  assert.match(helpers, /pinnedAccount:/);
});

test('read-only dashboard includes full account number fields and an account panel', () => {
  const patch = readFileSync(new URL('./patch-ops-board.mjs', import.meta.url), 'utf8');
  assert.match(patch, /label,bank_name,account_number,current_balance/);
  assert.match(patch, /account_number:\s*row\.account_number/);
  assert.match(patch, /ACCOUNT DIRECTORY/);
  assert.match(patch, /account-number/);
});

test('legacy CRUD source accepts full account number without removing settlement safeguards', () => {
  const theme = readFileSync(new URL('../src/lib/ceReplyTheme.ts', import.meta.url), 'utf8');
  const live = readFileSync(new URL('../src/lib/liveMessage.ts', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');

  assert.match(theme, /accountNumber\?: string \| null/);
  assert.match(theme, /data\.accountNumber/);
  assert.match(live, /accountNumber\?: string \| null/);
  assert.match(route, /accountNumber:\s*matched\.account_number/);
  assert.match(theme, /Settlement not verified/);
});
