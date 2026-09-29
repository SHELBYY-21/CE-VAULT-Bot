import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboardAuth';
import { setTransactionStatus } from '@/lib/transactions';
import { normalizeTransactionStatus } from '@/types/transactions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDashboardAdmin(req);
  if (denied) return denied;
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
