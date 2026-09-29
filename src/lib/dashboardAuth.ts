/** Server-verified read access for the CE VAULT dashboard.
 * All protected reads fail closed unless Firebase Auth and a UID allowlist
 * have been configured. Client-side API keys, Telegram IDs and PINs are NOT
 * dashboard authorization.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

function error(status: number, code: string) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function requireDashboardAdmin(req: NextRequest): Promise<NextResponse | null> {
  const allowed = (process.env.DASHBOARD_ALLOWED_UIDS ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // No default admin, no dev-mode bypass and no leaked secret as fallback.
  if (allowed.length === 0) return error(503, 'dashboard_auth_not_configured');

  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(header);
  if (!match) return error(401, 'authentication_required');

  try {
    const user = await adminAuth.verifyIdToken(match[1]!, true);
    if (!allowed.includes(user.uid)) return error(403, 'forbidden');
    return null;
  } catch {
    return error(401, 'invalid_or_expired_session');
  }
}
