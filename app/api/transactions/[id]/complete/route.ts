import { NextResponse } from 'next/server';
import { updateTransactionStatus } from '@/lib/updateTransactionStatus';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  try {
    await updateTransactionStatus(id, 'completed');
    return NextResponse.json({ ok: true, id, status: 'completed' });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'update failed' },
      { status: 500 },
    );
  }
}
