/** Manual webhook activation for canonical CE VAULT production.
 * Never accept secret-bearing GET URLs; never discard queued Telegram updates.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!process.env.API_SECRET) return NextResponse.json({ error: 'auth_not_configured' }, { status: 503 });
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const token = process.env.BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const origin = (process.env.APP_URL ?? '').replace(/\/$/, '');
  if (!token || !secret || !/^https:\/\/[^/]+(?::\d+)?$/.test(origin) || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return NextResponse.json({ error: 'telegram_configuration_incomplete' }, { status: 503 });
  }

  const api = async (method: string, payload: Record<string, unknown>) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(12000),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok && json.ok === true, result: json.result };
  };

  try {
    const me = await api('getMe', {});
    if (!me.ok || String((me.result as { id?: number } | undefined)?.id) !== token.split(':')[0]) {
      return NextResponse.json({ error: 'invalid_bot_token' }, { status: 503 });
    }
    const url = `${origin}/api/telegram/webhook`;
    const update = await api('setWebhook', {
      url, secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    });
    if (!update.ok) return NextResponse.json({ error: 'telegram_setwebhook_failed' }, { status: 502 });
    const verified = await api('getWebhookInfo', {});
    if (!verified.ok || (verified.result as { url?: string } | undefined)?.url !== url) {
      return NextResponse.json({ error: 'webhook_unverified' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, webhookUrl: url });
  } catch {
    return NextResponse.json({ error: 'telegram_network_error' }, { status: 502 });
  }
}
