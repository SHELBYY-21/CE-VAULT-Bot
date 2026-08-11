// ============================================================
// Parse Thai slip text (OCR output) into structured data
// Supports: SCB, KBANK, CIMB, BAY, BBL, KTB, TTB, GSB, TMN, etc.
// ============================================================

export interface ParsedSlipText {
  amount: number | null;
  bank: string | null;
  last4: string | null;
  receiverName: string | null;
  date: string | null;
  time: string | null;
}

/**
 * Parse Thai slip text (e.g., from OCR) into structured fields.
 * Handles:
 * - Amounts: "โอน 5,000 บาท", "12,500.50 THB"
 * - Banks: "SCB", "KBANK", "CIMB", etc. (Thai + English)
 * - Last 4 digits: "xxxx1234", "2330"
 * - Receiver name: Thai + English
 * - Date: "24/07/26", "2026-07-24"
 * - Time: "14:30"
 */
export function parseSlipText(text: string): ParsedSlipText {
  const cleaned = (text || '').replace(/\s+/g, ' ');

  // Extract amount (THB)
  const amountMatch = cleaned.match(
    /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:\u0e1a\u0e32\u0e17|THB|\u0e1a\.|บาท)/i
  );
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

  // Extract bank (Thai + English aliases)
  const bankMatch = cleaned.match(
    /\b(BANK|\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23|SCB|KBANK|CIMB|BAY|BBL|KTB|TTB|GSB|KKP|LH|UOB|TMN|TRUEMONEY|\u0e01\u0e2a\u0e34\u0e01\u0e23|\u0e44\u0e17\u0e22\u0e1e\u0e32\u0e13\u0e34\u0e0a\u0e22\u0e4c|\u0e01\u0e23\u0e38\u0e07\u0e44\u0e17\u0e22|\u0e01\u0e23\u0e38\u0e07\u0e28\u0e23\u0e35|\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e|\u0e2d\u0e2d\u0e21\u0e2a\u0e34\u0e19|\u0e17\u0e23\u0e39\u0e21\u0e31\u0e19\u0e19\u0e35\u0e48)\b/i
  );
  let bank = bankMatch ? bankMatch[1].toUpperCase() : null;
  if (bank === '\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23') bank = 'BANK';
  if (bank === 'TRUEMONEY') bank = 'TMN';

  // Extract last 4 digits (handles xxxx1234, ****1234, 2330, etc.)
  const last4Match = cleaned.match(
    /(?:x{2,}|\u2022{2,}|[\*]{2,}|\u0e1a\u0e31\u0e0d\u0e0a\u0e35|\b)(\d{4})\b/i
  );
  const last4 = last4Match ? last4Match[1] : null;

  // Extract receiver name (Thai + English)
  const nameMatch = cleaned.match(
    /(?:\u0e1c\u0e39\u0e49\u0e23\u0e31\u0e1a|\u0e42\u0e2d\u0e19\u0e43\u0e2b\u0e49|\u0e16\u0e36\u0e07|\u0e44\u0e1b\u0e22\u0e31\u0e07)\s*(?:\u0e19\u0e32\u0e22|\u0e19\u0e32\u0e07\u0e2a\u0e32\u0e27|\u0e19\u0e32\u0e07|\u0e04\u0e38\u0e13)?\s*([\u0e01-\u0e59a-zA-Z]{2,}\s+[\u0e01-\u0e59a-zA-Z]{2,})/
  );
  const receiverName = nameMatch ? nameMatch[1].trim() : null;

  // Extract date (DD/MM/YY or YYYY-MM-DD)
  const dateMatch = cleaned.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
  const date = dateMatch ? dateMatch[1] : null;

  // Extract time (HH:MM or HH:MM:SS)
  const timeMatch = cleaned.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  const time = timeMatch ? timeMatch[1] : null;

  return {
    amount,
    bank,
    last4,
    receiverName,
    date,
    time,
  };
}

/**
 * Calculate USDT amount to send based on THB amount and rate.
 * @param thb - THB amount (e.g., 5000)
 * @param rate - THB/USDT rate (e.g., 33.6)
 * @returns USDT amount (rounded to 2 decimals)
 */
export function computeShouldSend(thb: number, rate: number): number {
  if (!rate || rate <= 0 || !thb || thb <= 0) return 0;
  return parseFloat((thb / rate).toFixed(2));
}
