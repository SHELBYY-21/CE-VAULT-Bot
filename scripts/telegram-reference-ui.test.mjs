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


test('system card does not claim readiness when dependencies are unavailable', () => {
  const system = runtime.formatBotSystemReply({
    telegramOnline: true,
    webhookVerified: false,
    databaseConfigured: false,
    pendingUpdates: null,
    safety: 'LOCKED',
  });
  assert.match(system, /QUEUE\s+UNKNOWN/);
  assert.match(system, /CHECK REQUIRED/);
  assert.doesNotMatch(system, /OPERATOR READY/);
});

test('home reply exposes a real read-only inline navigation keyboard', () => {
  assert.equal(typeof runtime.botHomeReplyMarkup, 'function');
  const markup = runtime.botHomeReplyMarkup();
  const buttons = markup.inline_keyboard.flat();
  assert.ok(buttons.length >= 4);
  assert.ok(buttons.every((button) => typeof button.callback_data === 'string'));
  assert.deepEqual(
    buttons.map((button) => button.callback_data),
    ['ce:home', 'ce:scan', 'ce:status', 'ce:rate', 'ce:pin'],
  );
});

test('duplicate and promotion failure results are not mislabeled as active verification', () => {
  const duplicate = runtime.formatIntakeReply({
    pending: { ledger_ref: 'CE-DUP', status: 'RECORDED', thb_in: '1000' },
    duplicate: true,
  });
  assert.match(duplicate, /DUPLICATE/);
  assert.doesNotMatch(duplicate, /VERIFYING/);

  const failed = runtime.formatIntakeReply({
    pending: { ledger_ref: 'CE-FAIL', status: 'PROMOTION_FAILED', thb_in: '1000' },
  });
  assert.match(failed, /RECORD FAILED/);
  assert.doesNotMatch(failed, /VERIFYING/);
});

test('recorded card describes account/date match without claiming Telegram PIN verification', () => {
  const recorded = runtime.formatIntakeReply({
    pending: {
      ledger_ref: 'CE-20261008-B97B',
      status: 'RECORDED',
      thb_in: '10000',
      bank: 'KBANK',
      account_masked: '••••3855',
      pin_match: true,
    },
    recorded: { tx_id: 'tx-safe-id' },
  });
  assert.match(recorded, /ACCOUNT \/ DATE MATCHED/);
  assert.doesNotMatch(recorded, /PIN \/ BANK VERIFIED/);
});

test('runtime helper bounds webhook diagnostics and handles CE inline callbacks', () => {
  const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  assert.match(helpers, /Promise\.race/);
  assert.match(helpers, /handleTelegramCallback/);
  assert.match(helpers, /sendMessageWithMarkup/);
  assert.match(helpers, /pendingUpdates:\s*webhook\s*\?/);
});

test('base patch and v2 wrapper share the same helper source', () => {
  const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL('./patch-live-intake-v2.mjs', import.meta.url), 'utf8');
  assert.match(patch, /server-intake-helpers\.txt/);
  assert.doesNotMatch(patch, /const intakeHelpers = String\.raw/);
  assert.match(wrapper, /patch-live-intake\.mjs/);
  assert.doesNotMatch(wrapper, /LIVE_INTAKE_V2_TEMPLATE_BOUNDARY_NOT_FOUND/);
  assert.match(patch, /sendMessageWithMarkup/);
  assert.match(patch, /answerCallbackQuery/);
});


test('callback router uses a collision-safe local name in generated runtime patch', () => {
  const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  assert.match(patch, /const ceCallback = update\.callback_query/);
  assert.doesNotMatch(patch, /const callback = update\.callback_query/);
});
