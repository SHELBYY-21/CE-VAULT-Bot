/** CE VAULT financial-read authorization: verified Firebase Auth and explicit UID allowlist.
 * No default admin, no shared PIN, no API_SECRET in frontend, no fail-open mode.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export const DASHBOARD_COOKIE_NAME = 'ce_dashboard_session';
export const DASHBOARD_SESSION_SECONDS = 12 * 60 * 60;

export function dashboardAllowedUids(): string[] {
  return (process.env.DASHBOARD_ALLOWED_UIDS ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function error(status: number, code: string) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function verifyDashboardSessionCookie(raw: string | undefined): Promise<boolean> {
  const allowed = dashboardAllowedUids();
  if (allowed.length === 0 || !raw) return false;
  try {
    const user = await adminAuth.verifySessionCookie(raw, true);
    return allowed.includes(user.uid);
  } catch {
    return false;
  }
}

export async function requireDashboardAdmin(req: NextRequest): Promise<NextResponse | null> {
  const allowed = dashboardAllowedUids();
  if (allowed.length === 0) return error(503, 'dashboard_auth_not_configured');

  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(header);
  if (match) {
    try {
      const user = await adminAuth.verifyIdToken(match[1]!, true);
      return allowed.includes(user.uid) ? null : error(403, 'forbidden');
    } catch {
      return error(401, 'invalid_or_expired_session');
    }
  }
  const session = req.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  if (await verifyDashboardSessionCookie(session)) return null;
  return error(401, 'authentication_required');
}
