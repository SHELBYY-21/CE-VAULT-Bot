import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const patch = readFileSync(new URL('./patch-telegram-status-degrade.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const build = pkg.scripts.build;

test('telegram status degrades honestly instead of a misleading 503', () => {
  assert.ok(patch.includes('app.get("/api/v1/telegram/status", async (req, res) => {'), 'must target the real status route anchor');
  assert.ok(patch.includes('degraded: "TELEGRAM_API_UNREACHABLE"'));
  assert.ok(patch.includes('webhook: null'));
  assert.ok(patch.includes('const attempts = 3;'));
  assert.ok(patch.includes('String(error?.message || "TELEGRAM_API_UNREACHABLE").slice(0, 120)'), 'error detail must be bounded');
  assert.ok(!patch.includes('pending_update_count'), 'must never invent webhook fields');
  assert.ok(patch.includes('Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN)'), 'configured must come from the real token env');
});

test('hardened route registers before the base route and guards anchor uniqueness', () => {
  const hardenedIdx = patch.indexOf('degraded: "TELEGRAM_API_UNREACHABLE"');
  const tailIdx = patch.indexOf('` + telegramStatusAnchor');
  assert.ok(hardenedIdx >= 0 && tailIdx > hardenedIdx, 'hardened route must precede the preserved base anchor');
  assert.ok(patch.includes('EXPECTED_1_FOUND_'), 'replaceOnce must assert exactly one anchor occurrence');
  const routeCount = patch.split('app.get("/api/v1/telegram/status", async (req, res) => {').length - 1;
  assert.ok(routeCount >= 2, 'patch must contain both the hardened route and the base anchor');
});

test('build chain gates the status-degrade patch right after patch-live-intake-v2', () => {
  const v2Idx = build.indexOf('node scripts/patch-live-intake-v2.mjs');
  const degradeIdx = build.indexOf('node scripts/patch-telegram-status-degrade.mjs');
  const welcomeIdx = build.indexOf('node scripts/patch-welcome-photo.mjs');
  assert.ok(v2Idx >= 0 && degradeIdx > v2Idx, 'must run after patch-live-intake-v2 (which creates the anchor)');
  assert.ok(degradeIdx < welcomeIdx, 'must run before patch-welcome-photo');
  assert.ok(build.includes('node --test scripts/telegram-status-degrade.test.mjs'), 'test must be build-gated');
});
