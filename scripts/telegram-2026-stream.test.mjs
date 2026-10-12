import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatScanDraftRichMessage, formatSlipPhotoCaption, formatIntakeV4Reply } from '../runtime-patches/live-intake.mjs';

const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const patch = readFileSync(new URL('../scripts/patch-telegram-2026.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const build = pkg.scripts.build;

test('draft stages use tg-thinking, CE brand, and stay honest (no invented progress)', () => {
  for (const stage of ['download', 'match', 'ocr']) {
    const draft = formatScanDraftRichMessage(stage);
    assert.equal(typeof draft.html, 'string');
    assert.ok(draft.html.includes('<tg-thinking>'));
    assert.ok(draft.html.includes('</tg-thinking>'));
    assert.ok(draft.html.includes('◈ CE · SCAN ⚡'));
    assert.ok(draft.html.includes('ไม่มี fake progress'));
  }
  assert.ok(formatScanDraftRichMessage('download').html.includes('Telegram'));
  assert.ok(formatScanDraftRichMessage('match').html.includes('PIN'));
  assert.ok(formatScanDraftRichMessage('ocr').html.includes('AI OCR'));
  assert.ok(formatScanDraftRichMessage('surprise').html.includes('Telegram'));
});

test('handler streams drafts with feature detection, env gate, and static fallback', () => {
  assert.ok(helpers.includes('typeof telegram.sendRichMessageDraft === "function"'));
  assert.ok(helpers.includes('process.env.CE_RESPONSE_STREAM_SCAN !== "0"'));
  assert.ok(helpers.includes('formatScanDraftRichMessage("download")'));
  assert.ok(helpers.includes('formatScanDraftRichMessage("match")'));
  assert.ok(helpers.includes('formatScanDraftRichMessage("ocr")'));
  assert.ok(helpers.includes('streamScan = true'));
  assert.ok(helpers.includes('formatScanStageRichMessage(),'));
  assert.ok(helpers.includes('formatScanStageReply(),'));
});

test('Telegram 2026 button styles: approval colors and primary copy buttons', () => {
  assert.ok(helpers.includes('text: "✅ เข้า · ยืนยัน", style: "success", callback_data: "ce:approve:" + id'));
  assert.ok(helpers.includes('text: "📝 แก้ไข", style: "primary", callback_data: "ce:edit:" + id'));
  assert.ok(helpers.includes('text: "⛔ ไม่เข้า · ยกเลิก", style: "danger", callback_data: "ce:reject:" + id'));
  assert.equal((runtime.match(/type="copy_text" style="primary"/g) || []).length, 4);
});

test('build chain installs and tests the Telegram 2026 upgrade', () => {
  assert.ok(patch.includes('sendRichMessageDraft(chatId, draftId, richMessage)'));
  assert.ok(patch.includes('telegramRequest(token, "sendRichMessageDraft"'));
  assert.ok(patch.includes('TELEGRAM_2026_DRAFT_ANCHOR_NOT_FOUND'));
  assert.ok(build.includes('node scripts/patch-telegram-2026.mjs'));
  assert.ok(build.includes('node --test scripts/telegram-2026-stream.test.mjs'));
  assert.ok(build.indexOf('node scripts/patch-telegram-2026.mjs') > build.indexOf('node scripts/patch-welcome-photo.mjs'));
});

test('slip photo caption: slip + amounts, no percent, confirm/cancel hint', () => {
  const caption = formatSlipPhotoCaption({ pending: { ledger_ref: 'CE-20261012-AB12CD34', thb_in: '5000', should_send: '150.150150', bank: 'SCB' } });
  assert.ok(caption.includes('TX-'));
  assert.ok(caption.includes('💵 รับ 5,000.00 THB'));
  assert.ok(caption.includes('📤 ต้องส่ง 150.150150 USDT'));
  assert.ok(caption.includes('ยืนยัน'));
  assert.ok(caption.includes('ยกเลิก'));
  assert.ok(!caption.includes('%'));
  const reply = formatIntakeV4Reply({ pending: { status: 'VERIFIED', id: '00000000-0000-0000-0000-000000000001', ledger_ref: 'CE-1', thb_in: '1000', ocr_confidence: '98' } });
  assert.ok(!reply.includes('CONF'));
  assert.ok(!reply.includes('%'));
});

test('production import list covers every formatter referenced by helpers', () => {
  const patch = readFileSync(new URL('../scripts/patch-live-intake.mjs', import.meta.url), 'utf8');
  const importList = patch.slice(patch.indexOf('import { accountLast4'), patch.indexOf('} from "./live-intake.mjs"'));
  const referenced = new Set(helpers.match(/format[A-Za-z0-9]+/g) || []);
  for (const name of referenced) {
    assert.ok(importList.includes(name), 'missing from production imports: ' + name);
  }
  assert.ok(importList.includes('formatScanDraftRichMessage'));
  assert.ok(importList.includes('formatSlipPhotoCaption'));
});
