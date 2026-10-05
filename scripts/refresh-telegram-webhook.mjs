const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function supabaseHeaders(key) {
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (String(key).split('.').length === 3) headers.authorization = `Bearer ${key}`;
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
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return '';
    const value = await response.json().catch(() => '');
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

async function resolveSecret(primary, fallbackName) {
  const direct = String(primary || '').trim();
  return direct || loadVaultSecret(fallbackName);
}

async function setWebhook(token, secret, target) {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: target,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(`SET_WEBHOOK_HTTP_${response.status}`);
}

async function main() {
  const token = await resolveSecret(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN, 'BOT_TOKEN');
  const secret = await resolveSecret(process.env.TELEGRAM_WEBHOOK_SECRET, 'TELEGRAM_WEBHOOK_SECRET');
  const origin = (process.env.RENDER_EXTERNAL_URL || 'https://ce-vault-menu-first.onrender.com').replace(/\/$/, '');
  const target = `${origin}/api/telegram/webhook`;

  if (!token || !secret) {
    console.warn('[CE Bot] Webhook secret refresh skipped: credentials unavailable.');
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // Telegram getWebhookInfo never exposes the registered secret token. Re-registering
      // the same URL is therefore required to prove the remote secret matches this runtime.
      await setWebhook(token, secret, target);
      console.log('[CE Bot] Telegram webhook secret refreshed for canonical Render URL.');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1000 * attempt);
    }
  }

  console.warn(`[CE Bot] Webhook secret refresh failed after bounded retries: ${String(lastError?.message || 'unknown').slice(0, 80)}`);
}

await main();
