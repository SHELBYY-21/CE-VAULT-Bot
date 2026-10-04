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

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

void main();
