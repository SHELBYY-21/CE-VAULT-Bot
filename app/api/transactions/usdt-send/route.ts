// POST /api/transactions/usdt-send — เฟส 2 (ใช้ service กลางร่วมกับ webhook)
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiAuth';
import { recordUsdtSend, AdminNotFoundError } from '@/lib/transactions';
import type { UsdtSendRequest } from '@/types/transactions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireApiKey(req);
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as UsdtSendRequest;
    if (!body.adminTelegramId || !body.usdtAmount) {
      return NextResponse.json(
        { error: 'adminTelegramId และ usdtAmount จำเป็นต้องมี' },
        { status: 400 },
      );
    }

    const result = await recordUsdtSend({
      adminTelegramId: body.adminTelegramId,
      usdtAmount: body.usdtAmount,
      note: body.note,
      slipImageUrl: body.slipImageUrl,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof AdminNotFoundError) {
      return NextResponse.json({ error: 'ไม่พบแอดมิน' }, { status: 404 });
    }
    return NextResponse.json({ error: 'server error', detail: e?.message }, { status: 500 });
  }
}
