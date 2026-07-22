// GET /api/telegram/set-profile?secret=API_SECRET
// ตั้งชื่อ / About / Description / 12 commands ของบอท
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const NAME = '[CE] บัญชีหนังหมา📊';
const ABOUT = 'CE VAULT\n\nUSDT EXCHANGE\n\n24/7\n\nFAST • SAFE • TRUSTED';
const DESCRIPTION = '欢迎\n\nWelcome to\n\nCE VAULT';

const COMMANDS = [
  { command: 'start', description: 'เริ่มใช้งาน / ยินดีต้อนรับ' },
  { command: 'help', description: 'คู่มือใช้งาน CE VAULT' },
  { command: 'menu', description: 'เมนูคำสั่ง' },
  { command: 'today', description: 'ยอดห้องนี้วันนี้' },
  { command: 'newday', description: 'เริ่มวันใหม่ (ตัดยอด)' },
  { command: 'reset', description: 'ล้างยอดห้องนี้' },
  { command: 'setrate', description: 'ตั้งเรตขายห้อง — /setrate 40' },
  { command: 'rate', description: 'เรตตลาด Binance TH' },
  { command: 'receiver', description: 'ประวัติผู้รับ — /receiver 6578' },
  { command: 'cancel', description: 'ยกเลิกรายการที่ค้าง' },
  { command: 'export', description: 'ดาวน์โหลด CSV ยอดห้อง' },
  { command: 'setroom', description: 'ตั้งชื่อห้อง — /setroom ชื่อ' },
];

async function tg(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'BOT_TOKEN ไม่ได้ตั้งค่า' }, { status: 500 });

  const steps = {
    setMyName: await tg(token, 'setMyName', { name: NAME }),
    setMyShortDescription: await tg(token, 'setMyShortDescription', { short_description: ABOUT }),
    setMyDescription: await tg(token, 'setMyDescription', { description: DESCRIPTION }),
    setMyCommands: await tg(token, 'setMyCommands', { commands: COMMANDS }),
  };

  const ok = Object.values(steps).every((s: any) => s?.ok);
  return NextResponse.json({ ok, name: NAME, commands: COMMANDS.length, telegram: steps });
}
