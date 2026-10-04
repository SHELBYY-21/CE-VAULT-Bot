/** Manual webhook activation (optional).
 * Never accept secret-bearing GET URLs; never discard queued Telegram updates.
 * Normal auth uses API_SECRET. A narrowly scoped repair key derived from BOT_TOKEN
 * is accepted only by this route so operators can recover the Telegram webhook
 * without copying production secrets between hosting providers.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireApiKey } from '@/lib/apiAuth';

export const runtime = 'nodejs';

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function validRepairKey(req: NextRequest, token: string | undefined): boolean {
  if (!token) return false;
  const provided = req.headers.get('x-ce-repair-key') ?? '';
  const expected = crypto.createHash('sha256').update(`ce-vault:set-webhook:${token}`).digest('hex');
  return safeEqual(provided, expected);
}

export async function POST(req: NextRequest) {
  const token = process.env.BOT_TOKEN;
  const apiKeyResult = process.env.API_SECRET ? requireApiKey(req) : NextResponse.json({ error: 'auth_not_configured' }, { status: 503 });
  if (apiKeyResult && !validRepairKey(req, token)) return apiKeyResult;

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
