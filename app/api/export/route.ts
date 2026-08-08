// GET /api/export?secret=API_SECRET&chatId=<id>&since=<ISO>
import { NextRequest } from 'next/server';
import type { Query } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { exportRoomCsv, isFirestoreIndexError } from '@/lib/transactions';

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
  if (process.env.API_SECRET && p.get('secret') !== process.env.API_SECRET) {
    return new Response('unauthorized', { status: 401 });
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

    let q: Query = adminDb
      .collection('transactions')
      .where('type', '==', 'THB_DEPOSIT')
      .orderBy('created_at', 'desc')
      .limit(5000);
    if (since) {
      q = adminDb
        .collection('transactions')
        .where('type', '==', 'THB_DEPOSIT')
        .where('created_at', '>=', since)
        .orderBy('created_at', 'desc')
        .limit(5000);
    }

    let data: any[];
    try {
      const snap = await q.get();
      data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      if (!isFirestoreIndexError(e)) throw e;
      const snap = await adminDb.collection('transactions').where('type', '==', 'THB_DEPOSIT').get();
      data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r: any) => !since || String(r.created_at || '') >= since)
        .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 5000);
    }

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
