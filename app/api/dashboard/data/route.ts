// GET /api/dashboard/data — bootstrap สำหรับแดชบอร์ด (Admin SDK, ไม่พึ่ง client rules)
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Open read (owner decision): the dashboard has no passphrase/session login.
export async function GET() {
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