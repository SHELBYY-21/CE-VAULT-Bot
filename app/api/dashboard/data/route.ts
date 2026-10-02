// GET /api/dashboard/data — bootstrap สำหรับแดชบอร์ด (Admin SDK, ไม่พึ่ง client rules)
import { NextRequest, NextResponse } from 'next/server';
import { DASHBOARD_COOKIE, validDashboardSession } from '@/lib/dashboardSession';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Never expose transaction/admin records to an unauthenticated browser.
  if (!validDashboardSession(request.cookies.get(DASHBOARD_COOKIE)?.value)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const [txSnap, adminSnap, rateSnap] = await Promise.all([
      adminDb.collection('transactions').orderBy('created_at', 'desc').limit(100).get(),
      adminDb.collection('admins').orderBy('name', 'asc').get(),
      adminDb.collection('rates').orderBy('created_at', 'desc').limit(1).get(),
    ]);

    return NextResponse.json({
      ok: true,
      transactions: txSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      admins: adminSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      rate: rateSnap.empty ? null : rateSnap.docs[0]!.data(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}