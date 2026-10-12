import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDemoCards } from './telegram-demo-cards.mjs';

const start = readFileSync(new URL('./start.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('start.mjs spawns the demo preview only when explicitly enabled', () => {
  assert.match(start, /CE_RUN_ONE_SHOT_TG_DEMO_CARDS === '1'/);
  assert.match(start, /telegram-demo-cards\.mjs/);
  assert.match(start, /\[CE DEMO CARDS\]/);
});

test('build runs the demo cards pin test', () => {
  assert.match(pkg.scripts.build, /node --test scripts\/telegram-demo-cards\.test\.mjs/);
});

test('demo preview covers every operator card', () => {
  const cards = buildDemoCards();
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const id of ['intro', 'home', 'scan', 'verified', 'blocked', 'recorded', 'duplicate', 'status', 'outro']) {
    assert.ok(byId.has(id), 'missing demo card: ' + id);
  }
  assert.match(byId.get('intro').text, /DEMO/);
  assert.match(byId.get('home').caption, /CE EMPIRE/);
  assert.match(byId.get('scan').text, /① OCR/);
  assert.match(byId.get('verified').text, /TX-0001/);
  assert.match(byId.get('verified').text, /รอแอดมินอนุมัติ/);
  assert.match(byId.get('verified').text, /THB \(รับ\): 5,000.00/);
  assert.match(byId.get('blocked').text, /TX-0002/);
  assert.match(byId.get('blocked').text, /บัญชีไม่ตรง/);
  assert.match(byId.get('blocked').text, /MATCH ✗/);
  assert.match(byId.get('recorded').text, /TX-0003/);
  assert.match(byId.get('recorded').text, /บันทึก IN แล้ว/);
  assert.match(byId.get('status').text, /CE EMPIRE · SYSTEM STATUS/);
});

test('demo duplicate card stays compact: original-record pointer without a financial table', () => {
  const duplicate = buildDemoCards().find((card) => card.id === 'duplicate');
  assert.match(duplicate.text, /สลิปซ้ำ/);
  assert.match(duplicate.text, /รายการเดิม: CE-DEMO-0003/);
  assert.match(duplicate.text, /DUP ⚠/);
  assert.doesNotMatch(duplicate.text, /รับ \(THB\)/);
  assert.doesNotMatch(duplicate.text, /Confidence:/);
});

test('demo cards never reference real ledger rows', () => {
  const cards = buildDemoCards();
  for (const card of cards) {
    const text = String(card.text || card.caption || '');
    const refs = text.match(/CE-[A-Z0-9-]+/g) || [];
    for (const ref of refs) assert.match(ref, /^CE-DEMO-/);
  }
});

test('demo verified card previews the Thai confirm/cancel approval keyboard', () => {
  const verified = buildDemoCards().find((card) => card.id === 'verified');
  const row = verified.markup.inline_keyboard[0];
  assert.match(row[0].text, /เข้า · ยืนยัน/);
  assert.match(row[1].text, /แก้ไข/);
  assert.match(row[2].text, /ไม่เข้า · ยกเลิก/);
  assert.match(row[0].callback_data, /^ce:approve:CE-DEMO-/);
  assert.match(row[2].callback_data, /^ce:reject:CE-DEMO-/);
  assert.equal(row[0].style, 'success');
  assert.equal(row[2].style, 'danger');
});
