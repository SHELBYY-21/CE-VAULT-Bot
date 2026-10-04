// GET /api/export?secret=API_SECRET&chatId=<id>&since=<ISO>
import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DASHBOARD_COOKIE, validDashboardSession } from '@/lib/dashboardSession';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { exportRoomCsv } from '@/lib/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS = [
  'ledger_ref',
  'created_at',
  'room_name',
  'chat_id',
  'thb_amount',
  'usdt_amount',
  'buy_rate',
  'sell_rate',
  'net_profit_thb',
  'receiver_name',
  'receiver_bank',
  'receiver_last4',
  'usdt_network',
  'usdt_txid',
  'ocr_confidence',
];

function csvCell(v: any): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const sessionOk = validDashboardSession(req.cookies.get(DASHBOARD_COOKIE)?.value);
  const secret = process.env.API_SECRET ?? '';
  // Preserve the legacy server-side export API key option for existing integrations.
  // Never treat a missing API_SECRET as permission to export the ledger.
  const supplied = req.headers.get('x-api-key') || p.get('secret') || '';
  const keyOk = Boolean(secret && supplied) && timingSafeEqual(
    createHash('sha256').update(supplied).digest(),
    createHash('sha256').update(secret).digest(),
  );
  if (!sessionOk && !keyOk) {
    return new Response('unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const chatId = p.get('chatId');
  const since = p.get('since');
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    if (chatId) {
      const { csv } = await exportRoomCsv(Number(chatId), since);
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="ce-vault-${chatId}-${stamp}.csv"`,
        },
      });
    }

    let query = createSupabaseAdminClient()
      .from('transactions')
      .select('*')
      .eq('type', 'THB_DEPOSIT')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (since) query = query.gte('created_at', since);

    const { data: rowsData, error: rowsError } = await query;
    if (rowsError) throw rowsError;
    const data = (rowsData ?? []) as any[];

    const header = ['staff', ...COLS].join(',');
    const lines = data.map((r: any) =>
      [csvCell(r.admins?.name), ...COLS.map((c) => csvCell(r[c]))].join(','),
    );
    const csv = '﻿' + [header, ...lines].join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="ce-vault-all-${stamp}.csv"`,
      },
    });
  } catch (e: any) {
    return new Response(`error: ${e?.message ?? e}`, { status: 500 });
  }
}