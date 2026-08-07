export interface ParsedSlipText {
  amount: number | null;
  bank: string | null;
  last4: string | null;
  receiverName: string | null;
  date: string | null;
  time: string | null;
}

export function parseSlipText(text: string): ParsedSlipText {
  const cleaned = (text || '').replace(/\s+/g, ' ');

  // Extract amount THB
  const amountMatch = cleaned.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:บาท|THB|บ\.)?/i);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

  // Extract bank
  const bankMatch = cleaned.match(/\b(BANK|ธนาคาร|SCB|KBANK|CIMB|BAY|BBL|KTB|TTB|GSB|กรุงไทย|ไทยพาณิชย์|กสิกร|กรุงศรี|กรุงเทพ|ออมสิน)\b/i);
  let bank = bankMatch ? bankMatch[1].toUpperCase() : null;
  if (bank === 'ธนาคาร') bank = 'BANK';

  // Extract last 4 digits
  const last4Match = cleaned.match(/(?:x{2,}|•{2,}|[\*]{2,}|บัญชี|\b)(\d{4})\b/i);
  const last4 = last4Match ? last4Match[1] : null;

  // Extract receiver name
  const nameMatch = cleaned.match(/(?:ผู้รับ|โอนให้|ถึง|ไปยัง)\s*(?:นาย|นางสาว|นาง|คุณ)?\s*([ก-๙a-zA-Z]{2,}\s+[ก-๙a-zA-Z]{2,})/);
  const receiverName = nameMatch ? nameMatch[1].trim() : null;

  // Extract date
  const dateMatch = cleaned.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
  const date = dateMatch ? dateMatch[1] : null;

  // Extract time
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

export function computeShouldSend(thb: number, rate: number): number {
  if (!rate || rate <= 0 || !thb || thb <= 0) return 0;
  return parseFloat((thb / rate).toFixed(2));
}
