// POST /api/transactions/thb-deposit — เฟส 1 (ใช้ service กลางร่วมกับ webhook)
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiAuth';
import { recordThbDeposit, AdminNotFoundError } from '@/lib/transactions';
import type { ThbDepositRequest } from '@/types/transactions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireApiKey(req);
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as ThbDepositRequest;
    if (!body.adminTelegramId || !body.usdtAmount) {
      return NextResponse.json(
        { error: 'adminTelegramId และ usdtAmount จำเป็นต้องมี' },
        { status: 400 },
      );
    }

    const result = await recordThbDeposit({
      adminTelegramId: body.adminTelegramId,
      bankAccountId: body.bankAccountId ?? null,
      thbAmount: body.thbAmount,
      usdtAmount: body.usdtAmount,
      sellRate: body.sellRate,
      marketUsdtRate: body.marketUsdtRate,
      note: body.note,
      slipImageUrl: body.slipImageUrl,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof AdminNotFoundError) {
      return NextResponse.json({ error: 'ไม่พบแอดมินที่ผูกกับ Telegram ID นี้' }, { status: 404 });
    }
    return NextResponse.json({ error: 'server error', detail: e?.message }, { status: 500 });
  }
}
