import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
