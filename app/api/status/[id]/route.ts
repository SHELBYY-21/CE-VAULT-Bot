// GET /api/status/[id] — สถานะดีลสาธารณะ (ไม่เปิดเผยกำไร)
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  try {
    const snap = await adminDb.collection('transactions').doc(id).get();
    if (!snap.exists) return NextResponse.json({ ok: true, row: null });
    const d = snap.data()!;
    return NextResponse.json({
      ok: true,
      row: {
        id: snap.id,
        status: d.status ?? null,
        usdt_amount: Number(d.usdt_amount || 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
