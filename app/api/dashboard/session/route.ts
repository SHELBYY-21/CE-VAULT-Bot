/** Same-origin Firebase Dashboard session. Session cookie is HttpOnly and never shared
 * with the separate ChatGPT Site. Financial endpoints require server verification.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import {
  DASHBOARD_COOKIE_NAME, DASHBOARD_SESSION_SECONDS,
  dashboardAllowedUids, verifyDashboardSessionCookie,
} from '@/lib/dashboardAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };
function err(status: number, code: string) {
  return NextResponse.json({ ok: false, error: code }, { status, headers });
}
function sameOrigin(req: NextRequest) {
  return req.headers.get('origin') === req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  return (await verifyDashboardSessionCookie(req.cookies.get(DASHBOARD_COOKIE_NAME)?.value))
    ? NextResponse.json({ ok: true }, { headers })
    : err(401, 'authentication_required');
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return err(403, 'invalid_origin');
  const allowed = dashboardAllowedUids();
  if (allowed.length === 0) return err(503, 'dashboard_auth_not_configured');
  if (!req.headers.get('content-type')?.startsWith('application/json')) return err(415, 'json_required');
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 16 * 1024) return err(413, 'payload_too_large');

  let idToken: unknown;
  try { ({ idToken } = await req.json()); } catch { return err(400, 'invalid_json'); }
  if (typeof idToken !== 'string' || idToken.length > 8192 || idToken.length < 16) {
    return err(400, 'invalid_id_token');
  }
  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    if (!allowed.includes(decoded.uid)) return err(403, 'forbidden');
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!decoded.auth_time || nowSeconds - decoded.auth_time > 5 * 60) {
      return err(401, 'recent_signin_required');
    }
    const cookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: DASHBOARD_SESSION_SECONDS * 1000,
    });
    const out = NextResponse.json({ ok: true }, { headers });
    out.cookies.set({
      name: DASHBOARD_COOKIE_NAME,
      value: cookie,
      maxAge: DASHBOARD_SESSION_SECONDS,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return out;
  } catch {
    return err(401, 'invalid_or_expired_session');
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return err(403, 'invalid_origin');
  const out = NextResponse.json({ ok: true }, { headers });
  out.cookies.set({
    name: DASHBOARD_COOKIE_NAME,
    value: '',
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  return out;
}
