import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const live = readFileSync(new URL('../src/lib/liveMessage.ts', import.meta.url), 'utf8');
const telegram = readFileSync(new URL('../src/lib/telegram.ts', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/LIVE-MESSAGE.md', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');

test('state model separates RECORDED from SETTLED/DONE', () => {
  assert.match(live, /'RECORDED'/);
  assert.match(live, /'SETTLED'/);
  assert.match(live, /label:\s*'Recorded'/);
  assert.match(live, /label:\s*'Done'/);
  assert.match(live, /liveRecorded/);
  assert.match(live, /liveSettled/);
  assert.doesNotMatch(live, /SETTLED'[^\n]+label:\s*'Recorded'/);
  assert.match(docs, /RECORDED\s*≠\s*SETTLED/);
  assert.doesNotMatch(docs, /Pin match[^\n]*→\s*Settled/i);
});

test('Telegram transport supports Bot API 10.3 rich send/edit with text fallback', () => {
  assert.match(telegram, /rich_message\?:/);
  assert.match(telegram, /fallback_text\?:/);
  assert.match(telegram, /sendRichMessage/);
  assert.match(telegram, /editMessageText/);
  assert.match(telegram, /rich_message:/);
  assert.match(telegram, /link_preview_options:\s*\{\s*is_disabled:\s*true\s*\}/);
  assert.doesNotMatch(telegram, /disable_web_page_preview/);
});

test('runtime intake formatter provides Telegram-native rich card plus plain fallback', () => {
  assert.match(runtime, /formatIntakeRichMessage/);
  assert.match(runtime, /<details/);
  assert.match(runtime, /<table/);
  assert.match(runtime, /<tg-button-row/);
  assert.match(runtime, /type="copy_text"/);
  assert.match(runtime, /RECORDED/);
  assert.match(runtime, /WAIT/);
  assert.match(runtime, /DONE/);
});

test('generated runtime transport uses rich messages with fallback and one-message edit lifecycle', () => {
  assert.match(patch, /sendRichMessageWithFallback/);
  assert.match(patch, /editRichMessageWithFallback/);
  assert.match(patch, /link_preview_options/);
  assert.match(helpers, /liveMessage/);
  assert.match(helpers, /message_id/);
  assert.match(helpers, /editRichMessageWithFallback/);
  assert.match(helpers, /sendRichMessageWithFallback/);
});

test('V3 never exposes unimplemented financial action buttons', () => {
  const combined = runtime + '\n' + helpers;
  for (const unsafe of ['FORCE NEW', 'OVERRIDE', 'MANUAL RATE', 'SENT', 'CONFIRM']) {
    assert.doesNotMatch(combined, new RegExp('tg-button[^>]+>' + unsafe + '<', 'i'));
  }
});


test('recording THB preserves a WAITING_USDT session for the same live message', () => {
  const start = route.indexOf('async function commitIncoming');
  const end = route.indexOf('/** บันทึกขาออก', start);
  assert.ok(start >= 0 && end > start, 'commitIncoming block must exist');
  const block = route.slice(start, end);
  assert.match(block, /const\s+nextLiveMessageId\s*=\s*await\s+upsertLive/);
  assert.match(block, /await\s+setSession\(chatId,\s*userId,\s*\{[\s\S]*state:\s*'WAITING_USDT'/);
  assert.match(block, /live_message_id:\s*nextLiveMessageId/);
  assert.match(block, /ledger_ref:\s*ledgerRef/);
});

test('recorded source card explicitly points to WAIT rather than DONE', () => {
  const start = live.indexOf('export function liveRecorded');
  const end = live.indexOf('export function liveSettled', start);
  assert.ok(start >= 0 && end > start, 'liveRecorded block must exist');
  const block = live.slice(start, end);
  assert.match(block, /stage:\s*'RECORDED'/);
  assert.match(block, /WAIT/i);
  assert.doesNotMatch(block, /DONE\s*✓/);
});


test('classic inline callback buttons avoid RichMessage-only style fields', () => {
  assert.match(live, /callback_data:/);
  assert.doesNotMatch(live, /callback_data:[^\n]+\bstyle\s*:/);
});
