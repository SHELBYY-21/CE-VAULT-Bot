import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiAuth';
import { isOrderStatus } from '@/lib/orderStatus';
import { updateTransactionStatus } from '@/lib/updateTransactionStatus';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const status = body?.status;

  if (!isOrderStatus(status)) {
    return NextResponse.json({ ok: false, error: 'invalid status' }, { status: 400 });
  }

  try {
    await updateTransactionStatus(params.id, status);
    return NextResponse.json({ ok: true, id: params.id, status });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'update failed' }, { status: 500 });
  }
}
