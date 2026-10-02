// GET /api/cron/day-cut — cron endpoint (ยิงตอน 22:00 เวลาไทย)
// Netlify Scheduled Function (netlify/functions/day-cut-cron.ts) ยิงตอน 22:00 เวลาไทย (15:00 UTC)
// ทุกห้อง: โพสต์สรุปวันเก่าเข้าห้อง → ตั้ง day_cut_at = ตอนนี้ (เริ่มวันใหม่อัตโนมัติ)
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendMessage } from '@/lib/telegram';
import { getRoomDaySummary } from '@/lib/transactions';
import * as UI from '@/lib/botUi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.API_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!secret) return NextResponse.json({ error: 'api_auth_not_configured' }, { status: 503 });
  if (provided !== secret && bearer !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data: roomsData, error: roomsError } = await createSupabaseAdminClient()
    .from('chat_settings')
    .select('*');
  if (roomsError) throw roomsError;
  const rooms = (roomsData ?? []) as any[];

  let posted = 0;
  for (const room of rooms) {
    const chatId = Number((room as any).chat_id);
    if (!chatId) continue;
    try {
      const { ledger, staff } = await getRoomDaySummary(chatId, (room as any).day_cut_at);
      if (ledger.incomingList.length > 0) {
        await sendMessage(chatId, { text: '🌙 <b>สรุปปิดวัน (อัตโนมัติ 22:00)</b>' });
        await sendMessage(
          chatId,
          UI.ledgerCard({
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
          }),
        );
        posted++;
      }
    } catch {
      /* skip room */
    }
    await createSupabaseAdminClient()
      .from('chat_settings')
      .update({ day_cut_at: now, updated_at: now })
      .eq('chat_id', chatId)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return NextResponse.json({ ok: true, rooms: rooms.length, posted, at: now });
}