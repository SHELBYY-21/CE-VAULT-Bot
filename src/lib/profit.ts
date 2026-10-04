// ============================================================
// คำนวณกำไรจากการขาย USDT
// ทุนต่อหน่วย     = THB / USDT
// มูลค่าขายต่อ THB = USDT * sellRate
// กำไรสุทธิ THB    = มูลค่าขายต่อ - THB
// % กำไร          = (กำไรสุทธิ / THB) * 100
// ============================================================

export interface ProfitResult {
  costPerUnit: number;    // ทุนต่อหน่วย (บาท/USDT)
  sellValueThb: number;   // มูลค่าเมื่อขายออก (บาท)
  netProfitThb: number;   // กำไรสุทธิ (บาท)
  profitPercent: number;  // % กำไร
}

export function calculateProfit(
  thbAmount: number,
  usdtAmount: number,
  sellRate: number,
): ProfitResult {
  const costPerUnit = usdtAmount > 0 ? thbAmount / usdtAmount : 0;
  const sellValueThb = usdtAmount * sellRate;
  const netProfitThb = sellValueThb - thbAmount;
  const profitPercent = thbAmount > 0 ? (netProfitThb / thbAmount) * 100 : 0;

  return { costPerUnit, sellValueThb, netProfitThb, profitPercent };
}

/**
 * โมเดล "ฝาก THB → ส่ง USDT ให้จีน" (ตามธุรกิจจริง)
 * - รับ THB จากลูกค้า, ให้ USDT ที่เรตห้อง (roomRate) → usdtToSend = thb / roomRate
 * - ต้นทุนซื้อ USDT = usdtToSend × เรตตลาด (Binance)
 * - กำไร = THB ที่รับ − ต้นทุน
 */
export function calculateDepositProfit(
  thbAmount: number,
  usdtAmount: number,
  marketRate: number,
): ProfitResult {
  const costThb = usdtAmount * marketRate; // ต้นทุนซื้อ USDT ที่จะส่ง
  const netProfitThb = thbAmount - costThb;
  const profitPercent = thbAmount > 0 ? (netProfitThb / thbAmount) * 100 : 0;
  return {
    costPerUnit: marketRate,
    sellValueThb: thbAmount,
    netProfitThb,
    profitPercent,
  };
}
