// ============================================================
// GET /api/telegram/set-webhook?secret=API_SECRET
// เรียกครั้งเดียวหลัง deploy เพื่อบอก Telegram ให้ยิง update มาที่ webhook ของเรา
// ============================================================
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'BOT_TOKEN ไม่ได้ตั้งค่า' }, { status: 500 });

  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  const webhookUrl = `${base}/api/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: true,
    }),
  });
  const result = await res.json();

  return NextResponse.json({ webhookUrl, telegram: result });
}
