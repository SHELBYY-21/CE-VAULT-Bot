import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  botHomeReplyMarkup,
  ceBriefReplyMarkup,
  formatBotCeBriefReply,
} from '../runtime-patches/live-intake.mjs';

const OVERVIEW = {
  kpis: { thb_in: '5000', sent_usdt: '100', pending_usdt: '13.5', transactions: 2, pending_slips: 1, open_exceptions: 0 },
  rate: { sell_rate: '35.2' },
};

test('brief reflects real KPIs and never invents money rows', () => {
  const brief = formatBotCeBriefReply(OVERVIEW, {});
  assert.match(brief, /BRAIN ONLINE/);
  assert.match(brief, /5000 THB/);
  assert.match(brief, /100 USDT/);
  assert.match(brief, /13\.5 USDT/);
  assert.match(brief, /35\.2 THB\/USDT/);
  const empty = formatBotCeBriefReply({ kpis: {} }, { SCB_API_KEY: 'B', SCB_API_SECRET: 'K' });
  assert.match(empty, /วันนี้ยังไม่มีรายการจริง/);
  assert.ok(!/THB/.test(empty.split('TRACE')[0].split('BRIEF')[1] || ''));
});

test('brain prioritizes honest NEXT actions per state', () => {
  const noCreds = formatBotCeBriefReply(OVERVIEW, {});
  assert.match(noCreds, /SCB_API_KEY \+ SCB_API_SECRET/);
  const ready = formatBotCeBriefReply({ kpis: {} }, { SCB_API_KEY: 'B', SCB_API_SECRET: 'K' });
  assert.match(ready, /พบ credentials scb/);
  const scb = formatBotCeBriefReply({ kpis: {} }, { SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.match(scb, /พบ credentials scb/);
  const disabled = formatBotCeBriefReply({ kpis: {} }, { CE_SLIP_VERIFY: '0' });
  assert.match(disabled, /CE_SLIP_VERIFY=0/);
  const exceptions = formatBotCeBriefReply({ kpis: { open_exceptions: 2, pending_slips: 0 } }, { SCB_API_KEY: 'B', SCB_API_SECRET: 'K' });
  assert.match(exceptions, /EXCEPTIONS เปิด 2 รายการ/);
  assert.match(exceptions, /จัดการ exceptions 2 รายการก่อนอื่น/);
  const broken = formatBotCeBriefReply(null, {});
  assert.match(broken, /ยังไม่สามารถอ่านข้อมูลจริง/);
});

test('brief never echoes credential values', () => {
  const brief = formatBotCeBriefReply({ kpis: {} }, { SCB_API_KEY: 'BRANCHX', SCB_API_SECRET: 'SECRETK' });
  assert.ok(!brief.includes('SECRETK'));
  assert.ok(!brief.includes('BRANCHX'));
});

test('command board buttons are wired with 2026 styles', () => {
  const board = ceBriefReplyMarkup();
  const buttons = board.inline_keyboard.flat();
  assert.deepEqual(buttons.map((b) => b.callback_data), ['ce:brief', 'ce:status', 'ce:scan', 'ce:rate', 'ce:pin']);
  assert.equal(buttons.find((b) => b.callback_data === 'ce:brief').style, 'primary');
  const home = botHomeReplyMarkup();
  const homeButtons = home.inline_keyboard.flat();
  assert.deepEqual(homeButtons.map((b) => b.callback_data), ['ce:brief', 'ce:home', 'ce:scan', 'ce:status', 'ce:rate', 'ce:pin']);
});

test('handler, callback and router wiring pinned at real anchors', () => {
  const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  assert.ok(helpers.includes('async function handleTelegramCeBrief(message) {'));
  assert.ok(helpers.includes('await telegram.sendMessageWithMarkup(chatId, formatBotCeBriefReply(overview, process.env), ceBriefReplyMarkup());'));
  assert.ok(helpers.includes('if (data === "ce:brief") {'));
  const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  assert.ok(patch.includes('await handleTelegramCeBrief(message);'));
  const importList = patch.slice(patch.indexOf('import { accountLast4'), patch.indexOf('} from "./live-intake.mjs"'));
  for (const name of ['formatBotCeBriefReply', 'ceBriefReplyMarkup']) {
    assert.ok(importList.includes(name), 'missing from production imports: ' + name);
  }
});

test('real Thai bank logos are vendored and routed', () => {
  for (const code of ['scb', 'ktb', 'kbank', 'bbl', 'bay', 'gsb', 'ttb']) {
    const svg = new URL('../runtime-patches/brand/banks/' + code + '.svg', import.meta.url);
    assert.ok(existsSync(svg), 'missing logo: ' + code);
    assert.ok(readFileSync(svg, 'utf8').includes('<svg'));
  }
  assert.ok(existsSync(new URL('../runtime-patches/brand/banks/ATTRIBUTION.md', import.meta.url)));
  const logoPatch = readFileSync(new URL('./patch-bank-logos.mjs', import.meta.url), 'utf8');
  assert.ok(logoPatch.includes('/brand/banks/:code'));
  assert.ok(logoPatch.includes('omise/banks-logo'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.scripts.build.includes('patch-bank-logos.mjs'));
  assert.ok(pkg.scripts.build.includes('ce-brain.test.mjs'));
});


test('ops market promise header needle stays route-unique', () => {
  const patchSource = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  assert.ok(patchSource.includes('LIVE_INTAKE_OPS_PROMISE_HEADER_NOT_FOUND'));
  const routeUniqueNeedle = String.fromCharCode(92) + 'n      repository.listOpsTransactions(transactionLimit),';
  assert.strictEqual(patchSource.split(routeUniqueNeedle).length - 1, 2,
    'header needle and replacement must both extend with the route-unique ops route line so ' +
    'replaceOnce cannot be hijacked by the CE brief handler destructure substring');
  const continuationMarker = 'Promise.all(' + String.fromCharCode(91) + String.fromCharCode(39) + ' +';
  assert.strictEqual(patchSource.split(continuationMarker).length - 1, 2,
    'header needle and replacement must both carry the continuation operator');
});
