// GET /api/cron/daily-summary — ให้ Vercel Cron ยิงตอนสิ้นวัน (23:59 เวลาไทย)
// กันคนอื่นยิงด้วย secret query param
import { NextRequest, NextResponse } from 'next/server';
import { notifyDailySummary } from '@/lib/notifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.API_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
  // Vercel Cron ยิงพร้อม header 'Authorization: Bearer <CRON_SECRET>' — รับได้ทั้ง 2 ทาง
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret && provided !== secret && bearer !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await notifyDailySummary();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
