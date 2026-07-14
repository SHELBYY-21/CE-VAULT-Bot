// GET /api/export?secret=API_SECRET&chatId=<id>&since=<ISO>
// ดาวน์โหลด CSV ธุรกรรม (กรองต่อห้อง + ช่วงเวลาได้) — เปิดใน Excel/Sheets ได้เลย
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS = [
  'ledger_ref', 'created_at', 'room_name', 'chat_id',
  'thb_amount', 'usdt_amount', 'buy_rate', 'sell_rate', 'net_profit_thb',
  'receiver_name', 'receiver_bank', 'receiver_last4',
  'usdt_network', 'usdt_txid', 'ocr_confidence',
];

function csvCell(v: any): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (process.env.API_SECRET && p.get('secret') !== process.env.API_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  let q = supabaseAdmin
    .from('transactions')
    .select('*, admins(name)')
    .eq('type', 'THB_DEPOSIT')
    .order('created_at', { ascending: false })
    .limit(5000);
  const chatId = p.get('chatId');
  if (chatId) q = q.eq('chat_id', Number(chatId));
  const since = p.get('since');
  if (since) q = q.gte('created_at', since);

  const { data, error } = await q;
  if (error) return new Response(`error: ${error.message}`, { status: 500 });

  const header = ['staff', ...COLS].join(',');
  const lines = (data ?? []).map((r: any) =>
    [csvCell(r.admins?.name), ...COLS.map((c) => csvCell(r[c]))].join(','),
  );
  const csv = '﻿' + [header, ...lines].join('\n'); // BOM ให้ Excel อ่านไทยถูก

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ce-vault-${chatId || 'all'}-${stamp}.csv"`,
    },
  });
}
