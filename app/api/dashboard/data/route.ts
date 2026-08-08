// GET /api/dashboard/data — bootstrap สำหรับแดชบอร์ด (Admin SDK, ไม่พึ่ง client rules)
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
