// ============================================================
// ดึงเรต USDT/THB แบบเรียลไทม์จาก Binance TH (public, ไม่ต้อง auth)
// GET https://api.binance.th/api/v1/ticker/price?symbol=USDTTHB
// มี in-memory cache 30 วิ เพื่อลดจำนวนครั้งที่ยิง
// ============================================================
const BINANCE_TH_URL = 'https://api.binance.th/api/v1/ticker/price?symbol=USDTTHB';
const TTL_MS = 30_000;

let cache: { rate: number; at: number } | null = null;

/** คืนราคา USDT/THB ล่าสุด (THB ต่อ 1 USDT) หรือ null ถ้าดึงไม่ได้ */
export async function fetchBinanceThUsdtRate(): Promise<number | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rate;
  try {
    const res = await fetch(BINANCE_TH_URL, { cache: 'no-store' });
    const json: any = await res.json();
    const rate = Number(json?.price);
    if (!Number.isFinite(rate) || rate <= 0) return cache?.rate ?? null;
    cache = { rate, at: Date.now() };
    return rate;
  } catch {
    return cache?.rate ?? null; // ใช้ค่าล่าสุดที่เคยได้ ถ้ามี
  }
}
