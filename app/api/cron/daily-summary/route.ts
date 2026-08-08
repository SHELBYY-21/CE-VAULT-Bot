<<<<<<< HEAD
// GET /api/cron/daily-summary — เรียกตอนสิ้นวัน (manual / scheduler)
// กันคนอื่นยิงด้วย secret query param หรือ Authorization Bearer
=======
// GET /api/cron/daily-summary — cron endpoint สิ้นวัน (23:59 เวลาไทย)
// กันคนอื่นยิงด้วย secret query param หรือ Bearer
>>>>>>> cfa23290a5cf77efa8f4c162b717d220380337d3
import { NextRequest, NextResponse } from 'next/server';
import { notifyDailySummary } from '@/lib/notifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.API_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
<<<<<<< HEAD
=======
  // รับได้ทั้ง ?secret= และ Authorization: Bearer <secret>
>>>>>>> cfa23290a5cf77efa8f4c162b717d220380337d3
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret && provided !== secret && bearer !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await notifyDailySummary();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
