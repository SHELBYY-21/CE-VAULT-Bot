import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatScanDraftRichMessage } from '../runtime-patches/live-intake.mjs';

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
  assert.ok(helpers.includes('text: "✅ APPROVE", style: "success", callback_data: "ce:approve:" + id'));
  assert.ok(helpers.includes('text: "📝 EDIT", style: "primary", callback_data: "ce:edit:" + id'));
  assert.ok(helpers.includes('text: "⛔ REJECT", style: "danger", callback_data: "ce:reject:" + id'));
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
