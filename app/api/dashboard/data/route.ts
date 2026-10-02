// GET /api/dashboard/data — bootstrap สำหรับแดชบอร์ด (Admin SDK, ไม่พึ่ง client rules)
import { NextRequest, NextResponse } from 'next/server';
import { DASHBOARD_COOKIE, validDashboardSession } from '@/lib/dashboardSession';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Never expose transaction/admin records to an unauthenticated browser.
  if (!validDashboardSession(request.cookies.get(DASHBOARD_COOKIE)?.value)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const [txRes, adminRes, rateRes] = await Promise.all([
      createSupabaseAdminClient()
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      createSupabaseAdminClient().from('admins').select('*').order('name', { ascending: true }),
      createSupabaseAdminClient()
        .from('rates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    if (txRes.error || adminRes.error || rateRes.error) {
      throw txRes.error || adminRes.error || rateRes.error;
    }

    return NextResponse.json({
      ok: true,
      transactions: (txRes.data ?? []).map((r: any) => ({ ...r, id: String(r.id) })),
      admins: (adminRes.data ?? []).map((r: any) => ({ ...r, id: String(r.id) })),
      rate: rateRes.data?.[0] ?? null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}