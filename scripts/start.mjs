import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');

function supabaseHeaders(key) {
  const headers = {
    apikey: key,
    'content-type': 'application/json',
  };
  if (key.split('.').length === 3) headers.authorization = `Bearer ${key}`;
  return headers;
}

async function loadVaultSecret(name) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return '';

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/ce_secret_get`, {
      method: 'POST',
      headers: supabaseHeaders(key),
      body: JSON.stringify({ p_name: name }),
    });
    if (!response.ok) return '';
    const value = await response.json().catch(() => '');
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

async function buildRuntimeEnv() {
  const env = { ...process.env };

  const vaultBotToken = await loadVaultSecret('BOT_TOKEN');
  if (vaultBotToken) {
    env.BOT_TOKEN = vaultBotToken;
    env.TELEGRAM_BOT_TOKEN = vaultBotToken;
    console.log('[CE Secret Hub] BOT_TOKEN loaded from Supabase Vault.');
  }

  const vaultWebhookSecret = await loadVaultSecret('TELEGRAM_WEBHOOK_SECRET');
  if (vaultWebhookSecret) {
    env.TELEGRAM_WEBHOOK_SECRET = vaultWebhookSecret;
    console.log('[CE Secret Hub] TELEGRAM_WEBHOOK_SECRET loaded from Supabase Vault.');
  }

  if (!env.NOTIFY_CHAT_ID) {
    const vaultNotifyChat = await loadVaultSecret('NOTIFY_CHAT_ID');
    if (vaultNotifyChat) env.NOTIFY_CHAT_ID = vaultNotifyChat;
  }

  if (!env.ADMIN_TELEGRAM_IDS) {
    const vaultAdminIds = await loadVaultSecret('ADMIN_TELEGRAM_IDS');
    if (vaultAdminIds) env.ADMIN_TELEGRAM_IDS = vaultAdminIds;
  }

  return env;
}

async function telegramApi(token, method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(`${method} failed`);
  return payload.result;
}

async function supabaseRpc(env, name, body = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_RPC_NOT_CONFIGURED');

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseHeaders(key),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`SUPABASE_RPC_${name}_FAILED`);
  return payload;
}

function dispatcherChatId(env) {
  const direct = String(env.NOTIFY_CHAT_ID || '').trim();
  if (/^-?\d+$/.test(direct)) return direct;
  const firstAdmin = String(env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .find((value) => /^-?\d+$/.test(value));
  return firstAdmin || '';
}

function shouldNotifyOutbox(item) {
  if (item.topic === 'workflow.job.created.v1') return true;
  const state = String(item?.payload?.state || '');
  return ['NEED_CONFIRMATION', 'COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT'].includes(state);
}

function renderOutboxMessage(item) {
  const payload = item?.payload || {};
  const ref = payload.public_ref || 'CE';
  const state = payload.state || 'UPDATE';
  const version = payload.state_version ?? '-';
  const label = item.topic === 'workflow.job.created.v1' ? 'NEW SANDBOX JOB' : 'WORKFLOW UPDATE';
  return `CE VAULT · ${label}\n${ref}\nSTATE ${state}\nVERSION ${version}\nSandbox safety remains locked.`;
}

function startOutboxDispatcher(env) {
  const token = env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || '';
  const chatId = dispatcherChatId(env);
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  let stopped = false;

  if (!token || !chatId || !url || !key) {
    console.warn('[CE Outbox] Dispatcher disabled: Telegram destination or Supabase service credentials missing.');
    return () => { stopped = true; };
  }

  const run = async () => {
    console.log('[CE Outbox] Dispatcher online.');
    while (!stopped) {
      try {
        const items = await supabaseRpc(env, 'ce_claim_outbox_batch', { p_limit: 10 });
        for (const item of Array.isArray(items) ? items : []) {
          try {
            if (shouldNotifyOutbox(item)) {
              await telegramApi(token, 'sendMessage', {
                chat_id: chatId,
                text: renderOutboxMessage(item),
                disable_web_page_preview: true,
              });
            }
            await supabaseRpc(env, 'ce_complete_outbox', { p_id: item.id });
            console.log(`[CE Outbox] Dispatched ${item.topic} ${item.id}.`);
          } catch (error) {
            await supabaseRpc(env, 'ce_fail_outbox', {
              p_id: item.id,
              p_error_code: String(error?.message || 'DISPATCH_FAILED').slice(0, 64),
              p_retry_seconds: 5,
            }).catch(() => null);
            console.error(`[CE Outbox] Delivery failed for ${item.id}; retry scheduled.`);
          }
        }
      } catch (error) {
        console.error(`[CE Outbox] Poll failed: ${error?.message || 'unknown error'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  setTimeout(() => void run(), 2500);
  return () => { stopped = true; };
}

async function claimCanonicalWebhook(env) {
  const token = env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || '';
  const secret = env.TELEGRAM_WEBHOOK_SECRET || '';
  const base = (env.RENDER_EXTERNAL_URL || 'https://ce-vault-menu-first.onrender.com').replace(/\/$/, '');
  const target = `${base}/api/telegram/webhook`;

  if (!token || !secret) {
    console.warn('[CE Bot] Webhook cutover skipped: bot token or webhook secret missing.');
    return;
  }

  try {
    const before = await telegramApi(token, 'getWebhookInfo');
    if (before?.url !== target) {
      await telegramApi(token, 'setWebhook', {
        url: target,
        secret_token: secret,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: false,
      });
    }
    const after = await telegramApi(token, 'getWebhookInfo');
    if (after?.url !== target) throw new Error('Webhook verification mismatch');
    console.log(`[CE Bot] Canonical Render webhook verified; queued updates: ${after?.pending_update_count ?? 0}.`);
  } catch (error) {
    console.error(`[CE Bot] Webhook cutover failed: ${error.message}`);
  }
}

async function main() {
  const env = await buildRuntimeEnv();
  const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: 'inherit',
  });

  setTimeout(() => void claimCanonicalWebhook(env), 1800);
  const stopDispatcher = startOutboxDispatcher(env);

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      stopDispatcher();
      child.kill(signal);
    });
  }

  child.on('exit', (code, signal) => {
    stopDispatcher();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

void main();
