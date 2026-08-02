// ============================================================
// เครื่องคำนวณแปลงหน่วย THB ⇄ USDT ตามเรทที่กำหนด (ไม่บันทึกธุรกรรม)
//   THB → USDT : USDT = THB / rate
//   USDT → THB : THB  = USDT * rate
// ============================================================

export type Currency = 'THB' | 'USDT';

export interface ConvertResult {
  inputAmount: number;
  inputCurrency: Currency;
  outputAmount: number;
  outputCurrency: Currency;
  rate: number; // THB ต่อ 1 USDT ที่ใช้คำนวณ
}

export function convertThbUsdt(
  amount: number,
  currency: Currency,
  rate: number,
): ConvertResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('rate must be a positive number');
  }

  const outputCurrency: Currency = currency === 'THB' ? 'USDT' : 'THB';
  const outputAmount = currency === 'THB' ? amount / rate : amount * rate;

  return {
    inputAmount: amount,
    inputCurrency: currency,
    outputAmount,
    outputCurrency,
    rate,
  };
}

export interface ConvertQuery {
  amount: number;
  currency: Currency;
}

// ตัวเลข + สกุลเงินไม่บังคับ (ไม่ระบุ = THB) เช่น "5000", "5000 thb", "100 usdt", "100U"
// ปฏิเสธเครื่องหมายลบ: ถ้ามี - ตรง + ของ regex จะไม่ match
const QUERY_RE = /(?<!-)(\d[\d,]*(?:\.\d+)?)\s*(THB|USDT|บาท|ยู|[BUบ])?/i;

/** อ่านคำสั่ง /convert เช่น "5000", "5000 thb", "100 usdt" (ปฏิเสธจำนวนลบ) */
export function parseConvertQuery(text: string): ConvertQuery | null {
  const s = text || '';
  // ปฏิเสธข้อความที่มี - อยู่ก่อนตัวเลข (เช่น "-5 usdt")
  if (/-\s*\d/.test(s)) return null;
  const m = QUERY_RE.exec(s);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (m[2] || '').toUpperCase();
  const currency: Currency = unit === 'U' || unit === 'USDT' || unit === 'ยู' ? 'USDT' : 'THB';
  return { amount, currency };
}
