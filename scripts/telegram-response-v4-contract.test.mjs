import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatIntakeV4Reply, formatIntakeV4RichMessage } from '../runtime-patches/live-intake.mjs';

const response = readFileSync(new URL('../src/lib/ceVaultResponse.ts', import.meta.url), 'utf8');
const webhook = readFileSync(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');

test('V4 keeps RECORDED distinct from DONE', () => {
  assert.match(response, /RECORDED:[\s\S]*IN:\s*'done'[\s\S]*DONE:\s*'pending'/);
  assert.match(response, /DONE:[\s\S]*DONE:\s*'done'/);
});

test('ALL CHECKS PASS requires explicit evidence', () => {
  assert.match(response, /data\.allChecksPass === true/);
  assert.doesNotMatch(response, /checks[^\n]*length[^\n]*=== 0[^\n]*ALL CHECKS PASS/);
});

test('missing financial fields render as dash instead of invented values', () => {
  assert.match(response, /n === null \|\| n === undefined/);
  assert.match(response, /'—'/);
});

test('keyboard is caller-supplied, real-action only, and capped at three', () => {
  assert.match(response, /type RealAction = 'dealok' \| 'dealedit' \| 'cancelop' \| 'edit' \| 'del'/);
  assert.match(response, /slice\(0, 3\)/);
  assert.doesNotMatch(response, /'OVERRIDE'|'FORCE_NEW'|'MANUAL_RATE'|'HOLD'|'SENT'/);
});

test('every response callback action has an implemented production handler', () => {
  for (const action of ['dealok', 'dealedit', 'cancelop', 'edit', 'del']) {
    assert.match(webhook, new RegExp(`action === ['"]${action}['"]`));
  }
});

test('ERROR never claims OCR failed by default', () => {
  const errorStart = response.indexOf('ERROR:');
  const errorEnd = response.indexOf('\n  },', errorStart);
  const block = response.slice(errorStart, errorEnd);
  assert.doesNotMatch(block, /OCR:\s*'failed'/);
  assert.match(block, /ตรวจ Ledger ก่อน retry/);
});

const renderPatch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
const renderHelper = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const live = readFileSync(new URL('../src/lib/liveMessage.ts', import.meta.url), 'utf8');

test('V4 is wired into Next.js live cards and Render intake, with rollback', () => {
  assert.match(live, /buildV4Message/);
  assert.match(live, /buildV4Keyboard/);
  assert.match(live, /CE_RESPONSE_V4 !== '0'/);
  assert.match(renderPatch, /formatIntakeV4Reply, formatIntakeV4RichMessage/);
  assert.match(renderHelper, /useV4 \? formatIntakeV4RichMessage\(args\) : formatIntakeRichMessage\(args\)/);
  assert.match(renderHelper, /useV4 \? formatIntakeV4Reply\(args\) : formatIntakeReply\(args\)/);
});

test('Render V4 confirms checks only with explicit fresh market and pin evidence', () => {
  const base = {
    pending: { status: 'VERIFIED', ledger_ref: 'CE-1234', thb_in: '1000', should_send: '30.123456',
      pin_match: true, ocr_confidence: '98', bank: 'SCB', account_masked: '••••1234' },
    deskRate: { sell_rate: '33.20' }, market: { price: '33.1', fresh: true },
  };
  assert.match(formatIntakeV4Reply(base), /ALL CHECKS PASS/);
  assert.doesNotMatch(formatIntakeV4Reply({ ...base, market: { price: '33.1', fresh: false } }), /ALL CHECKS PASS/);
  assert.doesNotMatch(formatIntakeV4Reply({ ...base, pending: { ...base.pending, pin_match: false } }), /ALL CHECKS PASS/);
  assert.match(formatIntakeV4Reply(base), /30.123456 USDT/);
});

test('Render V4 does not settle a recorded deal and blocks duplicate replay claims', () => {
  const pending = { status: 'RECORDED', ledger_ref: 'CE-88aa', tx_id: 'tx-001', thb_in: '2000', pin_match: true };
  const recorded = formatIntakeV4Reply({ pending, recorded: { tx_id: 'tx-001' } });
  assert.match(recorded, /ยังไม่ SETTLED/);
  assert.match(recorded, /IN ✓ ─ WAIT ─ DONE/);
  assert.doesNotMatch(recorded, /ALL CHECKS PASS/);
  const duplicate = formatIntakeV4Reply({ pending, duplicate: true });
  assert.match(duplicate, /ห้ามบันทึกซ้ำ/);
  assert.doesNotMatch(duplicate, /บันทึก THB แล้ว ยังไม่ SETTLED/);
});

test('Render V4 rich message escapes untrusted slip text', () => {
  const rich = formatIntakeV4RichMessage({
    pending: { status: 'BANK_MISMATCH', bank: '<script>alert(1)</script>', ledger_ref: 'CE-01' },
  });
  assert.doesNotMatch(rich.html, /<script>/);
  assert.match(rich.html, /&lt;script&gt;/);
  assert.match(rich.html, /<details/);
});
