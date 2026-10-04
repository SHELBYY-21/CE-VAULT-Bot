/**
 * CE Empire Desk public connectivity probe.
 * The ChatGPT Site may read ONLY coarse service availability here.
 * No ledger, identity, admin, account, error detail or credentials are returned.
 * Business/financial data must be served through an authenticated same-origin BFF.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_ORIGIN = 'https://ce-vault-empire-desk.ce-ceo21.chatgpt.site';
const PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
  'Cache-Control': 'no-store, max-age=0',
};

const TELEGRAM_STATUS_TTL_MS = 60_000;
let telegramStatusCache: { value: 'verified' | 'not_verified' | 'not_configured' | 'unavailable'; checkedAt: number } | null = null;

async function getTelegramWebhookStatus() {
  const now = Date.now();
  if (telegramStatusCache && now - telegramStatusCache.checkedAt < TELEGRAM_STATUS_TTL_MS) {
    return telegramStatusCache.value;
  }

  const token = process.env.BOT_TOKEN ?? '';
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  if (!token || !appUrl) {
    telegramStatusCache = { value: 'not_configured', checkedAt: now };
    return telegramStatusCache.value;
  }

  const expectedUrl = `${appUrl}/api/telegram/webhook`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { url?: string } } | null;
    const value = response.ok && payload?.ok === true && payload.result?.url === expectedUrl
      ? 'verified'
      : 'not_verified';
    telegramStatusCache = { value, checkedAt: now };
    return value;
  } catch {
    telegramStatusCache = { value: 'unavailable', checkedAt: now };
    return telegramStatusCache.value;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_HEADERS });
}

export async function GET() {
  let dbOk = false;
  try {
    const { error } = await createSupabaseAdminClient().from('admins').select('id').limit(1);
    if (error) throw error;
    dbOk = true;
  } catch {
    // Never publish underlying credential, connection or database errors.
  }

  const telegramWebhook = await getTelegramWebhookStatus();

  return NextResponse.json({
    service: 'ce-vault-render',
    online: true,
    // legacy compat field (old monitor JS checks firestore === true) — reflects the Supabase probe
    firestore: dbOk,
    database: 'supabase',
    db: dbOk,
    telegramWebhook,
    financialData: 'requires_authenticated_session',
    checkedAt: new Date().toISOString(),
  }, { status: dbOk ? 200 : 503, headers: PUBLIC_HEADERS });
}
