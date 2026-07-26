// GET /api/dashboard/data — bootstrap สำหรับแดชบอร์ด (Admin SDK, ไม่พึ่ง client rules)
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { bangkokDayStartIso, computeTodayKpis } from '@/lib/dashboardToday';
import type { Admin, Transaction } from '@/types/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dayStart = bangkokDayStartIso();

    const [txSnap, adminSnap, rateSnap] = await Promise.all([
      adminDb.collection('transactions').orderBy('created_at', 'desc').limit(100).get(),
      adminDb.collection('admins').orderBy('name', 'asc').get(),
      adminDb.collection('rates').orderBy('created_at', 'desc').limit(1).get(),
    ]);

    let todayRows: Transaction[] = [];
    try {
      const todaySnap = await adminDb
        .collection('transactions')
        .where('created_at', '>=', dayStart)
        .orderBy('created_at', 'desc')
        .limit(500)
        .get();
      todayRows = todaySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Transaction[];
    } catch (e) {
      console.warn(
        '[dashboard/data] today query failed, falling back to recent window:',
        e instanceof Error ? e.message : e,
      );
    }

    const recent = txSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Transaction[];
    const admins = adminSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Admin[];

    const byId = new Map<string, Transaction>();
    for (const t of [...todayRows, ...recent]) byId.set(t.id, t);
    const transactions = [...byId.values()].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );

    // If today query failed, derive from merged recent list
    const todaySource = todayRows.length ? todayRows : transactions;
    const today = computeTodayKpis(todaySource, admins);

    return NextResponse.json({
      ok: true,
      transactions,
      admins,
      rate: rateSnap.empty ? null : rateSnap.docs[0]!.data(),
      today,
      dayStart,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
