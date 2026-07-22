// PATCH / DELETE /api/transactions/[id] — แก้ไข / ลบธุรกรรมจากแดชบอร์ด
import { NextRequest, NextResponse } from 'next/server';
import { deleteTransaction, editTransaction } from '@/lib/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });

  try {
    const body = await req.json();
    const newUsdt = Number(body?.usdtAmount ?? body?.newUsdt);
    const newThbRaw = body?.thbAmount ?? body?.newThb;
    const newThb = newThbRaw == null || newThbRaw === '' ? undefined : Number(newThbRaw);

    if (!Number.isFinite(newUsdt) || newUsdt < 0) {
      return NextResponse.json(
        { ok: false, error: 'usdtAmount must be a non-negative number' },
        { status: 400 },
      );
    }
    if (newThb !== undefined && (!Number.isFinite(newThb) || newThb < 0)) {
      return NextResponse.json(
        { ok: false, error: 'thbAmount must be a non-negative number' },
        { status: 400 },
      );
    }

    const result = await editTransaction(id, { newUsdt, newThb });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });

  try {
    const result = await deleteTransaction(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
