import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = await import('../runtime-patches/live-intake.mjs');

test('reference UI exposes CE EMPIRE home and system cards', () => {
  assert.equal(typeof runtime.formatBotHomeReply, 'function');
  assert.equal(typeof runtime.formatBotSystemReply, 'function');
  assert.equal(typeof runtime.formatScanStageReply, 'function');

  const home = runtime.formatBotHomeReply();
  assert.match(home, /CE EMPIRE/);
  assert.match(home, /01 SCAN/);
  assert.match(home, /02 OCR \/ EXTRACTED/);
  assert.match(home, /03 VERIFY/);
  assert.match(home, /04 RECORD/);

  const system = runtime.formatBotSystemReply({
    telegramOnline: true,
    webhookVerified: true,
    databaseConfigured: true,
    pendingUpdates: 0,
    safety: 'LOCKED',
  });
  assert.match(system, /CE EMPIRE · SYSTEM STATUS/);
  assert.match(system, /TELEGRAM\s+ONLINE/);
  assert.match(system, /WEBHOOK\s+VERIFIED/);
  assert.match(system, /DATABASE\s+CONFIGURED/);
  assert.match(system, /QUEUE\s+0/);
  assert.match(system, /SAFETY\s+LOCKED/);
  assert.match(system, /OPERATOR READY/);
});

test('scan card follows the visual state flow without fake progress', () => {
  const scan = runtime.formatScanStageReply();
  assert.match(scan, /01 SCAN/);
  assert.match(scan, /READING SLIP/);
  assert.match(scan, /02 OCR \/ EXTRACTED/);
  assert.doesNotMatch(scan, /\b\d{1,3}%\b/);
});

test('intake reply renders extracted and recorded states honestly', () => {
  const extracted = runtime.formatIntakeReply({
    pending: {
      ledger_ref: 'CE-20261008-B97B',
      status: 'BANK_MISMATCH',
      thb_in: '10000',
      should_send: '304.87',
      bank: 'KBANK',
      account_masked: '••••3855',
      pin_match: false,
    },
    deskRate: { sell_rate: '32.80' },
    market: { price: '32.50' },
  });
  assert.match(extracted, /02 OCR \/ EXTRACTED/);
  assert.match(extracted, /BANK_MISMATCH/);
  assert.match(extracted, /NOT VERIFIED/);

  const recorded = runtime.formatIntakeReply({
    pending: {
      ledger_ref: 'CE-20261008-B97B',
      status: 'RECORDED',
      thb_in: '10000',
      should_send: '304.87',
      bank: 'KBANK',
      account_masked: '••••3855',
      pin_match: true,
    },
    deskRate: { sell_rate: '32.80' },
    market: { price: '32.50' },
    recorded: { tx_id: 'tx-safe-id' },
  });
  assert.match(recorded, /03 DONE/);
  assert.match(recorded, /RECORD SAVED/);
  assert.match(recorded, /SETTLEMENT NOT RUN/);
  assert.doesNotMatch(recorded, /\bSETTLED\b/);
});

test('generated runtime router owns home and ping commands', () => {
  const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');

  assert.match(patch, /start\|help\|menu\|ce/);
  assert.match(patch, /ping\|status/);
  assert.match(helpers, /handleTelegramHome/);
  assert.match(helpers, /handleTelegramSystemStatus/);
});
