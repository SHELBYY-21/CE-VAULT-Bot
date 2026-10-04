import { NextRequest, NextResponse } from 'next/server';
import {
  checkDashboardPassphrase, dashboardAuthConfigured, dashboardAuthMissing, DASHBOARD_COOKIE,
  DASHBOARD_TTL_SECONDS, issueDashboardSession, validDashboardSession,
} from '@/lib/dashboardSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Staging single-instance throttle. Replace with durable rate limiter if scaled.
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
function clientKey(request: NextRequest) {
  return (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim().slice(0, 80) || 'unknown';
}
function response(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  return response({
    configured: dashboardAuthConfigured(),
    missing: dashboardAuthMissing(),
    authenticated: validDashboardSession(request.cookies.get(DASHBOARD_COOKIE)?.value),
  });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response({ ok: false, error: 'invalid_origin' }, 403);
  if (!dashboardAuthConfigured()) return response({ ok: false, error: 'not_configured' }, 503);
  const id = clientKey(request);
  const now = Date.now();
  const state = failedAttempts.get(id);
  if (state && state.resetAt > now && state.count >= MAX_ATTEMPTS) {
    return response({ ok: false, error: 'too_many_attempts' }, 429);
  }
  let body: { passphrase?: unknown };
  try {
    if (Number(request.headers.get('content-length') || 0) > 2048) throw new Error('too_large');
    body = await request.json();
  } catch {
    return response({ ok: false, error: 'invalid_input' }, 400);
  }
  if (!checkDashboardPassphrase(body?.passphrase)) {
    const prev = state && state.resetAt > now ? state.count : 0;
    if (failedAttempts.size > 2048) failedAttempts.clear();
    failedAttempts.set(id, { count: prev + 1, resetAt: now + WINDOW_MS });
    return response({ ok: false, error: 'invalid_credentials' }, 401);
  }
  failedAttempts.delete(id);
  const token = issueDashboardSession(now);
  if (!token) return response({ ok: false, error: 'not_configured' }, 503);
  const result = response({ ok: true });
  result.cookies.set(DASHBOARD_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: DASHBOARD_TTL_SECONDS,
  });
  return result;
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return response({ ok: false, error: 'invalid_origin' }, 403);
  const result = response({ ok: true });
  result.cookies.set(DASHBOARD_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: 0,
  });
  return result;
}
