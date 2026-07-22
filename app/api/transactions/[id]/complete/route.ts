import { NextResponse } from 'next/server';
import { setTransactionStatus } from '@/lib/transactions';
import { normalizeTransactionStatus } from '@/types/transactions';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
