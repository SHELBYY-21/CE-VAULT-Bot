import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asset = readFileSync(new URL('../runtime-patches/webflow.webm', import.meta.url));
const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const patch = readFileSync(new URL('./patch-webm-flow-card.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('WEB FLOW animation is a genuine EBML/WebM video of meaningful size', () => {
  assert.equal(asset[0], 0x1a);
  assert.equal(asset[1], 0x45);
  assert.equal(asset[2], 0xdf);
  assert.equal(asset[3], 0xa3);
  assert.ok(asset.length > 30000, 'animation must be a real rendered video, not a stub');
});

test('home handler sends the webm animation first, falls back to photo and text', () => {
  assert.ok(helpers.includes('async function handleTelegramHome(message) {'));
  assert.ok(helpers.includes('CE_RESPONSE_WEBM !== ' + String.fromCharCode(34) + '0' + String.fromCharCode(34)));
  assert.ok(helpers.includes('await telegram.sendAnimationWithMarkup(message.chat.id, webmUrl, formatBotHomeReply(), botHomeReplyMarkup());'));
  assert.ok(helpers.includes('await telegram.sendPhotoWithMarkup(message.chat.id, welcomeUrl, formatBotHomeReply(), botHomeReplyMarkup());'));
  assert.ok(helpers.includes('await telegram.sendMessageWithMarkup(message.chat.id, formatBotHomeReply(), botHomeReplyMarkup());'));
  assert.ok(helpers.includes('/brand/webflow.webm'));
  assert.ok(helpers.includes('/brand/welcome.jpg'));
});

test('webm patch wires asset, route and telegram method at real anchors', () => {
  assert.ok(patch.includes("path.join(root, 'runtime-patches', 'webflow.webm')"));
  assert.ok(patch.includes('/brand/webflow.webm'));
  assert.ok(patch.includes('sendAnimationWithMarkup'));
  assert.ok(patch.includes('WEBM_FLOW_ROUTE_ANCHOR_NOT_FOUND'));
  assert.ok(patch.includes('WEBM_FLOW_TELEGRAM_ANCHOR_NOT_FOUND'));
});

test('build runs the webm patch after the welcome photo patch', () => {
  assert.ok(pkg.scripts.build.includes('node --test scripts/webm-flow-card.test.mjs'));
  const welcome = pkg.scripts.build.indexOf('node scripts/patch-welcome-photo.mjs');
  const webm = pkg.scripts.build.indexOf('node scripts/patch-webm-flow-card.mjs');
  assert.ok(welcome >= 0 && webm > welcome, 'patch-webm-flow-card must run after patch-welcome-photo');
});
