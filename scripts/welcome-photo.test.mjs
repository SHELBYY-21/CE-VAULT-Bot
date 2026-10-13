import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const banner = readFileSync(new URL('../runtime-patches/welcome.jpg', import.meta.url));
const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const patch = readFileSync(new URL('./patch-welcome-photo.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const runtime = await import('../runtime-patches/live-intake.mjs');

test('welcome banner is a genuine JPEG of meaningful size', () => {
  assert.equal(banner[0], 0xff);
  assert.equal(banner[1], 0xd8);
  assert.equal(banner[2], 0xff);
  assert.ok(banner.length > 20000, 'banner must be a real rendered image, not a stub');
});

test('home handler sends the welcome photo and falls back to text', () => {
  assert.match(helpers, /async function handleTelegramHome\(message\) \{/);
  assert.ok(helpers.includes('await telegram.sendPhotoWithMarkup(message.chat.id, welcomeUrl, formatBotHomeReply(), botHomeReplyMarkup());'));
  assert.match(helpers, /\/brand\/welcome\.jpg/);
  assert.ok(helpers.includes('await telegram.sendMessageWithMarkup(message.chat.id, formatBotHomeReply(), botHomeReplyMarkup());'));
});

test('welcome patch wires asset, route and telegram method at real anchors', () => {
  assert.match(patch, /runtime-patches', 'welcome\.jpg/);
  assert.match(patch, /\/brand\/welcome\.jpg/);
  assert.match(patch, /sendPhotoWithMarkup/);
  assert.match(patch, /WELCOME_PHOTO_ROUTE_ANCHOR_NOT_FOUND/);
  assert.match(patch, /WELCOME_PHOTO_TELEGRAM_ANCHOR_NOT_FOUND/);
});

test('build runs the welcome patch after the intake patch', () => {
  assert.match(pkg.scripts.build, /node --test scripts\/welcome-photo\.test\.mjs/);
  const v2 = pkg.scripts.build.indexOf('node scripts/patch-live-intake-v2.mjs');
  const welcome = pkg.scripts.build.indexOf('node scripts/patch-welcome-photo.mjs');
  assert.ok(v2 >= 0 && welcome > v2, 'patch-welcome-photo must run after patch-live-intake-v2');
});

test('home reply welcomes the boss while keeping CE EMPIRE pins', () => {
  const home = runtime.formatBotHomeReply();
  assert.match(home, /ยินดีต้อนรับ BOSS/);
  assert.match(home, /CE EMPIRE/);
  assert.match(home, /OPERATOR ONLINE/);
  assert.match(home, /FLOW ▸ ① OCR · ② MATCH · ③ IN · ④ WAIT · ⑤ DONE/);
  assert.match(home, /NEXT ▸/);
});
