// GET /api/market-rate — เรตตลาด USDT/THB สดจาก Binance TH (ให้ dashboard ดึงไปโชว์)
import { NextResponse } from 'next/server';
import { fetchBinanceThUsdtRate } from '@/lib/binance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rate = await fetchBinanceThUsdtRate();
  return NextResponse.json({
    symbol: 'USDTTHB',
    source: 'binance_th',
    marketUsdtRate: rate,
    at: new Date().toISOString(),
  });
}
