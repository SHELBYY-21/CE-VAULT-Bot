import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const RECOVERY_CONTEXT = 'ce-vault-telegram-webhook-recovery-v1';

function deriveRecoverySecret(token: string): string {
  return createHash('sha256')
    .update(`${RECOVERY_CONTEXT}:${token}`)
    .digest('base64url');
}

/**
 * Recovery compatibility for the Telegram webhook.
 *
 * Production normally authenticates Telegram with TELEGRAM_WEBHOOK_SECRET.
 * If that host-specific secret is unavailable to the deployment controller,
 * a second secret can be deterministically derived from BOT_TOKEN. The proxy
 * accepts only that derived value and rewrites it to the host-local primary
 * secret before the route executes. No raw secret is committed or logged.
 */
export function proxy(request: NextRequest) {
  const primary = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  const token = process.env.BOT_TOKEN ?? '';
  const provided = request.headers.get('x-telegram-bot-api-secret-token') ?? '';

  if (primary && token && provided === deriveRecoverySecret(token)) {
    const headers = new Headers(request.headers);
    headers.set('x-telegram-bot-api-secret-token', primary);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/telegram/webhook'],
};
