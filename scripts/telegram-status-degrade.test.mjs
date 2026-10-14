import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const patch = readFileSync(new URL('./patch-telegram-status-degrade.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const build = pkg.scripts.build;

test('telegram status degrades honestly instead of a misleading 503', () => {
  assert.ok(patch.includes('app.get("/api/v1/telegram/status", async (req, res) => {'), 'must target the real status route anchor');
  assert.ok(patch.includes('TELEGRAM_API_UNREACHABLE'));
  assert.ok(patch.includes('webhook: null'));
  assert.ok(patch.includes('const attempts = 3;'));
  assert.ok(!patch.includes('String(error?.message'), 'raw fetch errors may contain token URLs');
  assert.ok(!patch.includes('pending_update_count'), 'must never invent webhook fields');
  assert.ok(patch.includes('Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN)'), 'configured must come from the real token env');
});

test('hardened route registers before the base route and guards anchor uniqueness', () => {
  const hardenedIdx = patch.indexOf('degraded: error?.transient');
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

// Execute the generated handler, rather than only checking source strings.
import vm from 'node:vm';
const handlerSource = patch.split('const hardenedStatusRoute = String.raw`')[1].split('` + telegramStatusAnchor')[0];
async function invoke(fetchImpl, configured = true) {
  let handler;
  let result;
  let calls = 0;
  const context = {
    app: { get: (_path, fn) => { handler = fn; } },
    process: { env: configured ? { BOT_TOKEN: 'test-only-token' } : {} },
    telegram: configured ? {} : null,
    AbortController,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 2500 ? 5 : 0),
    clearTimeout,
    fetch: (...args) => { calls++; return fetchImpl(...args); },
  };
  vm.runInNewContext(handlerSource, context);
  const res = { set: () => res, json: value => { result = JSON.parse(JSON.stringify(value)); } };
  await handler({}, res);
  return { result, calls };
}
const reply = (status, payload) => ({ ok: status < 400, status, json: async () => payload });
test('unconfigured diagnostics return immediately without network calls', async () => {
  const { result, calls } = await invoke(() => { throw Error('must not call'); }, false);
  assert.equal(calls, 0);
  assert.deepEqual(result, { configured: false, webhook: null });
});
test('transient transport failure recovers on retry', async () => {
  let n = 0;
  const { result, calls } = await invoke(async () => {
    if (++n < 3) throw Error('transport');
    return reply(200, { ok: true, result: { pending_update_count: 0 } });
  });
  assert.equal(calls, 3);
  assert.equal(result.webhook.pending_update_count, 0);
});
test('hung fetch aborts after deadline and degrades after three attempts', async () => {
  const { result, calls } = await invoke((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
  }));
  assert.equal(calls, 3);
  assert.equal(result.degraded, 'TELEGRAM_API_UNREACHABLE');
  assert.equal(result.webhook, null);
});
test('invalid credentials fail once with a safe auth category', async () => {
  const { result, calls } = await invoke(async () => reply(401, { ok: false }));
  assert.equal(calls, 1);
  assert.equal(result.degraded, 'TELEGRAM_AUTH_FAILED');
});
test('429 and server failures retry; permanent API errors do not', async () => {
  for (const status of [429, 503, 400]) {
    const { calls } = await invoke(async () => reply(status, { ok: false }));
    assert.equal(calls, status === 400 ? 1 : 3);
  }
});
test('diagnostics never return raw network errors or token URLs', async () => {
  const { result } = await invoke(async () => { throw Error('https://api.telegram.org/bottest-only-token/getWebhookInfo'); });
  assert.equal(JSON.stringify(result).includes('test-only-token'), false);
});
test('deadline also aborts a stalled response body', async () => {
  const { result, calls } = await invoke(async (_url, { signal }) => ({
    ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))),
  }));
  assert.equal(calls, 3);
  assert.equal(result.webhook, null);
});
