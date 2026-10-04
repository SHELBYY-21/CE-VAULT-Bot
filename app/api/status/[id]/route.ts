// GET /api/status/[id] — สถานะดีลสาธารณะ (ไม่เปิดเผยกำไร)
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { normalizeTransactionStatus } from '@/types/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from('transactions')
      .select('id,status,usdt_amount,usdt_txid')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: true, row: null });
    const d = data as Record<string, any>;
    return NextResponse.json({
      ok: true,
      row: {
        id: String(d.id),
        status: normalizeTransactionStatus(d.status),
        usdt_amount: Number(d.usdt_amount || 0),
        tx_hash: d.usdt_txid ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}