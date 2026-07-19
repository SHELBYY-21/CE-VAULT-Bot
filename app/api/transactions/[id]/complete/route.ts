// POST /api/transactions/[id]/complete
// แอดมินกดปุ่ม "ส่ง USDT แล้ว" ในหน้า Transaction Detail → อัปเดต status='completed'
// เรียกจากแดชบอร์ด (เบราว์เซอร์) จึงไม่ตรวจ x-api-key (โพสเจอร์เดียวกับแดชบอร์ดปัจจุบัน)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('transactions')
    .update({ status: 'completed' })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
