// ============================================================
// คำนวณค่าธรรมเนียม (ส่วนต่างระหว่าง USDT ที่ควรได้ กับที่ได้จริง)
// Expected USDT = ยอดเงินบาท / เรท USDT ตลาด (marketUsdtRate)
// Fee USDT      = Expected USDT - Actual USDT
// % Fee         = (Fee USDT / Expected USDT) * 100
// ============================================================

export interface FeeResult {
  expectedUsdt: number; // USDT ที่ควรได้ตามเรทตลาด
  feeUsdt: number;      // ส่วนต่างที่หายไป (ค่าธรรมเนียม)
  feePercent: number;   // % ค่าธรรมเนียม
}

export function calculateFee(
  thbAmount: number,
  marketUsdtRate: number,
  actualUsdt: number,
): FeeResult {
  const expectedUsdt = marketUsdtRate > 0 ? thbAmount / marketUsdtRate : 0;
  const feeUsdt = expectedUsdt - actualUsdt;
  const feePercent = expectedUsdt > 0 ? (feeUsdt / expectedUsdt) * 100 : 0;

  return { expectedUsdt, feeUsdt, feePercent };
}
