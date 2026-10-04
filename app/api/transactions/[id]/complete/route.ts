import { NextRequest, NextResponse } from 'next/server';
import { DASHBOARD_COOKIE, validDashboardSession } from '@/lib/dashboardSession';
import { requireApiKey } from '@/lib/apiAuth';
import { setTransactionStatus } from '@/lib/transactions';
import { normalizeTransactionStatus } from '@/types/transactions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Browser action must carry an authenticated, same-origin session.
  // Trusted automations can instead use a configured x-api-key.
  const sessionOk = validDashboardSession(req.cookies.get(DASHBOARD_COOKIE)?.value) &&
    req.headers.get('origin') === req.nextUrl.origin;
  if (!sessionOk) {
    const unauthorized = requireApiKey(req);
    if (unauthorized) return unauthorized;
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  }

  try {
    const status = await setTransactionStatus(id, normalizeTransactionStatus('completed'));
    return NextResponse.json({ ok: true, status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
