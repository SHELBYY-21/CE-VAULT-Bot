// GET /api/cron/day-cut — Vercel Cron ยิงตอน 04:00 เวลาไทย (21:00 UTC)
// ทุกห้อง: โพสต์สรุปวันเก่าเข้าห้อง → ตั้ง day_cut_at = ตอนนี้ (เริ่มวันใหม่อัตโนมัติ)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendMessage } from '@/lib/telegram';
import { getRoomDaySummary } from '@/lib/transactions';
import * as UI from '@/lib/botUi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.API_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret && provided !== secret && bearer !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data: rooms } = await supabaseAdmin
    .from('chat_settings')
    .select('chat_id, room_name, fixed_rate, day_cut_at');

  let posted = 0;
  for (const room of rooms ?? []) {
    const chatId = Number((room as any).chat_id);
    if (!chatId) continue;
    try {
      const { ledger, staff } = await getRoomDaySummary(chatId, (room as any).day_cut_at);
      // โพสต์สรุปเฉพาะห้องที่มีรายการ (กันสแปมห้องว่าง)
      if (ledger.incomingList.length > 0) {
        await sendMessage(chatId, { text: '🌙 <b>สรุปปิดวัน (อัตโนมัติ 04:00)</b>' });
        await sendMessage(chatId, UI.ledgerCard({
          incomingList: ledger.incomingList,
          outgoingList: ledger.outgoingList,
          totalThb: ledger.totalThb,
          totalIncomingUsdt: ledger.totalIncomingUsdt,
          totalOutgoingUsdt: ledger.totalOutgoingUsdt,
          fixedRate: (room as any).fixed_rate ? Number((room as any).fixed_rate) : null,
          feePercent: 0,
          netProfitThb: ledger.netProfitThb,
          lastAdminName: ledger.lastAdminName,
          roomName: (room as any).room_name ?? null,
          staff,
        }));
        posted++;
      }
    } catch {
      /* ห้องนี้ error ก็ข้ามไป ไม่ให้ล้มทั้ง cron */
    }
    // ตัดวัน
    await supabaseAdmin
      .from('chat_settings')
      .update({ day_cut_at: now, updated_at: now })
      .eq('chat_id', chatId)
      .then(undefined, () => undefined);
  }

  return NextResponse.json({ ok: true, rooms: rooms?.length ?? 0, posted, at: now });
}
