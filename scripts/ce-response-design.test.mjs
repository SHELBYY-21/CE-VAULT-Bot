import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = await import('../runtime-patches/live-intake.mjs');

test('Telegram home uses the approved five-stage CE EMPIRE workflow', () => {
  const home = runtime.formatBotHomeReply();
  assert.match(home, /CE EMPIRE/);
  assert.match(home, /CURRENT STATE/);
  assert.match(home, /① OCR/);
  assert.match(home, /② MATCH/);
  assert.match(home, /③ IN/);
  assert.match(home, /④ WAIT/);
  assert.match(home, /⑤ DONE/);
  assert.match(home, /NEXT ACTION/);
  assert.doesNotMatch(home, /01 SCAN|02 OCR \/ EXTRACTED|03 VERIFY|04 RECORD/);
});

test('scan and intake replies preserve OCR MATCH IN WAIT DONE semantics', () => {
  const scan = runtime.formatScanStageReply();
  assert.match(scan, /① OCR\s+ACTIVE/);
  assert.match(scan, /② MATCH\s+NEXT/);
  assert.match(scan, /NEXT ACTION/);

  const mismatch = runtime.formatIntakeReply({
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
  assert.match(mismatch, /② MATCH\s+ALERT/);
  assert.match(mismatch, /③ IN\s+BLOCKED/);
  assert.match(mismatch, /NEXT ACTION/);

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
  assert.match(recorded, /③ IN\s+RECORDED/);
  assert.match(recorded, /④ WAIT\s+USDT/);
  assert.match(recorded, /⑤ DONE\s+PENDING/);
  assert.match(recorded, /SETTLEMENT NOT RUN/);
  assert.doesNotMatch(recorded, /03 DONE ✓/);
});

test('system reply follows Current State, Key Data, Next Action hierarchy', () => {
  const system = runtime.formatBotSystemReply({
    telegramOnline: true,
    webhookVerified: true,
    databaseConfigured: true,
    pendingUpdates: 0,
    safety: 'LOCKED',
  });
  assert.match(system, /CURRENT STATE\s+READY/);
  assert.match(system, /KEY DATA/);
  assert.match(system, /NEXT ACTION/);
});

test('web board patch carries CE EMPIRE fintech visual system and five-stage rail', () => {
  const patch = readFileSync(new URL('./patch-ops-board.mjs', import.meta.url), 'utf8');
  assert.match(patch, /CE EMPIRE/);
  assert.match(patch, /BANK SLIP → USDT/);
  assert.match(patch, /workflow-rail/);
  assert.match(patch, />OCR</);
  assert.match(patch, />MATCH</);
  assert.match(patch, />IN</);
  assert.match(patch, />WAIT</);
  assert.match(patch, />DONE</);
  assert.match(patch, /SMART INBOX/);
  assert.match(patch, /--cyan:#35e7ff/);
  assert.match(patch, /--gold:#f3c96b/);
  assert.match(patch, /--success:#4ee28a/);
  assert.match(patch, /--warning:#ffbf4d/);
  assert.match(patch, /--danger:#ff5f65/);
  assert.match(patch, /@media\(max-width:760px\)/);
  assert.match(patch, /prefers-reduced-motion/);
});


test('home and scan replies stay compact - no per-stage explanations', () => {
  const home = runtime.formatBotHomeReply();
  assert.match(home, /FLOW  ① OCR · ② MATCH · ③ IN · ④ WAIT · ⑤ DONE/);
  assert.doesNotMatch(home, /รับและอ่านสลิป|บันทึกยอดเมื่อผ่านเงื่อนไข|ปิดเมื่อมีผลลัพธ์จริง/);
  const scan = runtime.formatScanStageReply();
  assert.match(scan, /① OCR\s+ACTIVE/);
  assert.match(scan, /→ กำลังอ่านสลิป$/);
});
