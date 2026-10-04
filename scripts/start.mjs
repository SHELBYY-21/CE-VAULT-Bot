import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');
const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

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

async function claimCanonicalWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const base = (process.env.RENDER_EXTERNAL_URL || 'https://ce-vault-menu-first.onrender.com').replace(/\/$/, '');
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

setTimeout(() => void claimCanonicalWebhook(), 1800);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
