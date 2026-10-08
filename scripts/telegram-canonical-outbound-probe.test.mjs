import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probeCanonicalBotDelivery } from './telegram-canonical-outbound-probe.mjs';

const env = {
  BOT_TOKEN: 'LOCAL_FAKE_TOKEN_NO_TRAFFIC',
  SUPABASE_URL: 'https://supabase.example.invalid',
  SUPABASE_SECRET_KEY: 'LOCAL_FAKE_KEY',
  RENDER_EXTERNAL_URL: 'https://render.example.invalid',
};
function mockClient({ webhook = 'https://render.example.invalid/api/telegram/webhook', privateChat = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const endpoint = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ endpoint: endpoint.replace(env.BOT_TOKEN, 'TOKEN_REDACTED'), method: endpoint.split('/').at(-1), body });
    let response;
    if (endpoint.endsWith('/getMe')) response = { ok: true, result: { id: 8731325927, is_bot: true } };
    else if (endpoint.endsWith('/getWebhookInfo')) response = { ok: true, result: { url: webhook } };
    else if (endpoint.includes('/rest/v1/admins?')) response = [{ telegram_user_id: 987654321 }];
    else if (endpoint.endsWith('/getChat')) response = { ok: true, result: { id: 987654321, type: privateChat ? 'private' : 'group' } };
    else if (endpoint.endsWith('/sendMessage')) response = { ok: true, result: { message_id: 456 } };
    else throw new Error('UNEXPECTED_TEST_NETWORK_CALL');
    return { ok: true, json: async () => response };
  };
  return { calls, fetchImpl };
}
test('canonical test follows bot identity, exact webhook, active admin, private chat and one silent send', async () => {
  const { calls, fetchImpl } = mockClient();
  assert.equal(await probeCanonicalBotDelivery(env, fetchImpl), true);
  assert.deepEqual(calls.map(x => x.method), ['getMe', 'getWebhookInfo', 'admins?select=telegram_user_id&is_active=eq.true&order=created_at.asc&limit=10', 'getChat', 'sendMessage']);
  const send = calls.at(-1).body;
  assert.equal(send.chat_id, 987654321);
  assert.equal(send.disable_notification, true);
  assert.match(send.text, /SANDBOX/);
  assert.match(send.text, /\/status/);
});
test('webhook mismatch blocks sending before database lookup', async () => {
  const { calls, fetchImpl } = mockClient({ webhook: 'https://incorrect.example.invalid/api/telegram/webhook' });
  assert.equal(await probeCanonicalBotDelivery(env, fetchImpl), false);
  assert.deepEqual(calls.map(x => x.method), ['getMe', 'getWebhookInfo']);
});
test('unverified private destination blocks sendMessage', async () => {
  const { calls, fetchImpl } = mockClient({ privateChat: false });
  assert.equal(await probeCanonicalBotDelivery(env, fetchImpl), false);
  assert.ok(calls.some(x => x.method === 'getChat'));
  assert.ok(!calls.some(x => x.method === 'sendMessage'));
});
test('missing credentials never trigger an outbound request', async () => {
  let called = 0;
  assert.equal(await probeCanonicalBotDelivery({}, async () => { called++; throw new Error('BLOCKED'); }), false);
  assert.equal(called, 0);
});
test('production startup stays opt-in, separate child and not a webhook consumer', () => {
  const startup = readFileSync(new URL('./start.mjs', import.meta.url), 'utf8');
  const probe = readFileSync(new URL('./telegram-canonical-outbound-probe.mjs', import.meta.url), 'utf8');
  assert.match(startup, /CE_RUN_ONE_SHOT_TG_OUTBOUND_PROBE === '1'/);
  assert.match(startup, /telegram-canonical-outbound-probe\.mjs/);
  assert.doesNotMatch(probe, /deleteWebhook|setWebhook|ce_promote_pending_slip|pending_slips|\/rest\/v1\/bank_accounts/);
  assert.doesNotMatch(probe, /console\.log\([^\n]*(?:token|dbKey|admins)/);
});
