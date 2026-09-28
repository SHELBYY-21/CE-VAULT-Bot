/**
 * CE VAULT Design Lock v1.0: Telegram presentation contract.
 * The MSG IDs map to ce-vault-messages.html. Only render an ID after its
 * triggering business state was independently verified by existing logic.
 * Do not use the sample amounts, accounts or names from the HTML preview.
 */
export const CE_MESSAGE_STATES = {
  'MSG-01': 'OCR', 'MSG-02': 'VERIFY', 'MSG-03': 'OCR ERROR',
  'MSG-04': 'REVIEW', 'MSG-05': 'MISMATCH', 'MSG-06': 'DUPLICATE',
  'MSG-07': 'LIMIT', 'MSG-08': 'RATE CHANGED', 'MSG-09': 'READY',
  'MSG-10': 'PENDING', 'MSG-11': 'SETTLED', 'MSG-12': 'SHORT',
  'MSG-13': 'PENDING', 'MSG-14': 'SETTLED', 'MSG-15': 'REJECTED',
  'MSG-16': 'MISMATCH', 'MSG-17': 'VERIFY', 'MSG-18': 'OVERRIDE',
  'MSG-19': 'OVERRUN', 'MSG-20': 'SUMMARY', 'MSG-21': 'NEW CYCLE',
  'MSG-22': 'NEW CYCLE', 'MSG-23': 'ALERT', 'MSG-24': 'CRITICAL',
  'MSG-25': 'ALERT', 'MSG-26': 'ALERT', 'MSG-27': 'ALERT',
  'MSG-28': 'ALERT', 'MSG-29': 'ERROR', 'MSG-30': 'ALERT',
} as const;
export type CeMessageId = keyof typeof CE_MESSAGE_STATES;
export const CE_RULE = '━━━━━━━━━━━━━━';
export const CE_DIVIDER = '─────────────';

export function ceEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
export const ceAmount = (n: number): string =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Keep actual USDT precision: never round a ledger value to THB display precision. */
export const ceUsdt = (n: number): string =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(n);

/** OCR-only presentation. This is not a verified deposit or ledger write. */
export function ceOcrAmount(thb: number | null | undefined, confidence?: number | null): string {
  const amount = thb != null && Number.isFinite(thb) && thb > 0
    ? '<b>' + ceAmount(thb) + ' THB</b>'
    : '<b>ยังอ่านยอดไม่ได้</b>';
  const conf = confidence != null && Number.isFinite(confidence)
    ? '\nOCR Confidence: ' + Math.max(0, Math.min(100, confidence)).toFixed(0) + '%'
    : '';
  return '📥 ยอดจากสลิป / Extracted Amount / 识别金额 (OCR)\n' + amount + conf +
    '\n<i>ยังไม่ยืนยัน / Not yet verified / 尚未核实</i>';
}

/** Telegram HTML renderer: no unsupported CSS or HTML tags. */
export function ceMessage(id: CeMessageId, body: string): string {
  return `◈ CE · ${CE_MESSAGE_STATES[id]}\n${CE_RULE}\n${body}`;
}

/** Actual recorded amount is not proof of final, reconciled settlement. */
export function ceRecorded(data: {
  kind: 'incoming' | 'outgoing'; ledgerRef: string; thb?: number | null;
  usdt?: number | null; sellRate?: number | null; adminName?: string | null;
  bank?: string | null; last4?: string | null;
}): string {
  const incoming = data.kind === 'incoming';
  const body = [
    incoming ? '✅ บันทึกเงินเข้า / Deposit Recorded / 入账已记录' : '✅ บันทึกยอดส่งออก / Transfer Recorded / 转出已记录',
    '',
    data.thb != null ? `📥 ยอดเข้า / Received    <b>${ceAmount(data.thb)} THB</b>` : null,
    data.usdt != null ? `${incoming ? '💎 คาดว่าจะส่ง / Expected USDT' : '📤 ส่งออก / Outgoing USDT'}   <b>${ceUsdt(data.usdt)} USDT</b>` : null,
    data.sellRate != null ? `💱 อัตราแลกเปลี่ยน / Rate  ${ceAmount(data.sellRate)}` : null,
    data.bank || data.last4 ? `🏦 ธนาคาร / Bank  ${ceEscape(data.bank || '-')}${data.last4 ? ` · ••••${ceEscape(data.last4)}` : ''}` : null,
    data.adminName ? `👤 ผู้ดำเนินการ / Operator  ${ceEscape(data.adminName)}` : null,
    `🆔 เลขอ้างอิง / Reference / 交易编号  #${ceEscape(data.ledgerRef)}`,
    incoming ? '⏳ รอตรวจสอบการชำระครบ / Settlement not verified / 尚未结算确认' : null,
  ].filter((line) => line !== null).join('\n');
  return `◈ CE · RECORDED / 已记录 ✓\n${CE_RULE}\n${body}`;
}
