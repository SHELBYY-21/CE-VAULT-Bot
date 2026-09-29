// Configure Telegram webhook from server-only environment before Next.js starts.
// Idempotent: Telegram setWebhook safely replaces the current webhook for this bot.
const token = process.env.BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET;
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

if (!token || !appUrl) {
  console.warn('[telegram] webhook setup skipped: BOT_TOKEN or APP_URL is not configured');
  process.exit(0);
}

try {
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) {
    console.error('[telegram] setWebhook failed:', response.status, body?.description || 'unknown error');
    process.exit(0); // Web service must still start; health remains inspectable.
  }
  console.log('[telegram] webhook configured for production endpoint');
} catch (error) {
  console.error('[telegram] setWebhook request failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(0);
}
