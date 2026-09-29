// CE VAULT · Next.js runtime bootstrap for a single production-hosted Telegram webhook.
// Does not run during `next build`. No secrets or token-bearing API URLs are logged.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const portFlag = args.findIndex((value) => value === '--port' || value === '-p');
const requestedPort = portFlag >= 0 ? args[portFlag + 1] : undefined;
const port = String(process.env.PORT || requestedPort || '3000');
const nextBin = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const standalone = join(process.cwd(), 'server.js');
const useStandalone = existsSync(standalone);
const child = spawn(process.execPath, useStandalone ? [standalone] : [nextBin, 'start', '--hostname', '0.0.0.0', '--port', port], {
  stdio: 'inherit',
  env: process.env,
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

child.on('exit', (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}

async function telegramCall(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(12000),
  });
  const reply = await res.json().catch(() => ({}));
  return { http: res.status, ok: res.ok && reply.ok === true, result: reply.result };
}

async function registerWebhook() {
  if (process.env.CE_AUTO_WEBHOOK !== '1') {
    console.info('[CE Bot] Manual webhook mode; auto-registration disabled.');
    return;
  }
  const token = process.env.BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = (process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\\/$/, '');
  const missing = [
    ['BOT_TOKEN', token],
    ['TELEGRAM_WEBHOOK_SECRET', secret],
    ['APP_URL_OR_RAILWAY_PUBLIC_DOMAIN', appUrl],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    console.error(`[CE Bot] Missing environment variable(s): ${missing.join(', ')}; webhook unchanged.`);
    return;
  }
  if (!/^https:\/\/[^/]+(?:\:\d+)?$/.test(appUrl) || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    console.error('[CE Bot] Invalid APP_URL or Telegram secret_token format; webhook unchanged.');
    return;
  }

  // Wait for the actual Next process to answer, then verify its webhook rejects bad secrets.
  let serverReady = false;
  for (let attempt = 0; attempt < 40 && !serverReady && child.exitCode == null; attempt++) {
    await sleep(1000);
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret-probe' },
        body: '{}',
        signal: AbortSignal.timeout(3500),
      });
      serverReady = probe.status === 401;
    } catch { /* Next not ready yet */ }
  }
  if (!serverReady) {
    console.error('[CE Bot] Webhook route did not reject unsigned requests; webhook unchanged.');
    return;
  }

  // Full operation mode must have a working database before moving the Telegram receiver.
  if (process.env.CE_BOT_MENU_ONLY !== '1') {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(9000) });
      if (!health.ok || (await health.json()).db !== 'ok') {
        console.error('[CE Bot] Firebase health not verified; webhook unchanged.');
        return;
      }
    } catch {
      console.error('[CE Bot] Firebase health unavailable; webhook unchanged.');
      return;
    }
  }

  try {
    const me = await telegramCall(token, 'getMe');
    if (!me.ok || String(me.result?.id) !== token.split(':')[0]) {
      console.error(`[CE Bot] Telegram getMe validation failed (HTTP ${me.http}); webhook unchanged.`);
      return;
    }
    console.info(`[CE Bot] Token validated for bot ID ${me.result.id}.`);
    const url = `${appUrl}/api/telegram/webhook`;
    const set = await telegramCall(token, 'setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    });
    if (!set.ok) {
      console.error(`[CE Bot] Telegram setWebhook failed (HTTP ${set.http}); pending updates preserved.`);
      return;
    }
    const info = await telegramCall(token, 'getWebhookInfo');
    if (!info.ok || info.result?.url !== url) {
      console.error('[CE Bot] getWebhookInfo did not confirm expected production endpoint.');
      return;
    }
    console.info(`[CE Bot] Production webhook active; queued updates: ${Number(info.result.pending_update_count || 0)}.`);
    const commands = await telegramCall(token, 'setMyCommands', {
      commands: [
        { command: 'ce', description: 'เมนูหลัก CE VAULT' },
        { command: 'ping', description: 'ตรวจสอบการตอบกลับ' },
        { command: 'help', description: 'คู่มือใช้งานบอต' },
        { command: 'id', description: 'ดู Telegram IDs' },
        { command: 'ledger', description: 'ยอดห้อง (เมื่อ Firebase พร้อม)' },
      ],
    });
    if (!commands.ok) console.warn('[CE Bot] setMyCommands unsuccessful; basic replies still available.');
  } catch {
    console.error('[CE Bot] Telegram bootstrap encountered a network error; inspect safe status logs.');
  }
}

void registerWebhook();
