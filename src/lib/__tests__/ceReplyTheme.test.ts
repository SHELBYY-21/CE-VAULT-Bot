import { describe, expect, it } from 'vitest';
import { CE_MESSAGE_STATES, ceAmount, ceUsdt, ceOcrAmount, ceEscape, ceMessage, ceRecorded } from '../ceReplyTheme';

describe('CE VAULT message design lock', () => {
  it('lists all MSG-01 to MSG-30 without gaps', () => {
    expect(Object.keys(CE_MESSAGE_STATES)).toEqual(
      Array.from({ length: 30 }, (_, i) => 'MSG-' + String(i + 1).padStart(2, '0')),
    );
  });
  it('renders the actual template heading', () => {
    expect(ceMessage('MSG-05', '❌ บัญชีไม่ตรงกัน')).toContain('◈ CE · MISMATCH');
    expect(ceMessage('MSG-01', 'OCR')).toContain('━━━━━━━━━━━━━━');
  });
  it('escapes dynamic values before Telegram HTML rendering', () => {
    expect(ceEscape('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
    expect(ceAmount(10000)).toBe('10,000.00');
  });
  it('renders the extracted amount inside the OCR frame without pretending it is saved', () => {
    expect(ceOcrAmount(1200, 94)).toContain('1,200.00 THB');
    expect(ceOcrAmount(1200, 94)).toContain('94%');
    expect(ceOcrAmount(null)).toContain('ยังอ่านยอดไม่ได้');
    expect(ceOcrAmount(null)).not.toContain('500.00');
  });
  it('preserves ledger USDT precision instead of rounding to two decimals', () => {
    expect(ceUsdt(12.3456)).toBe('12.3456');
    expect(ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-2', usdt: 12.3456 }))
      .toContain('12.3456 USDT');
  });
  it('does not call an incoming deposit a settled transfer', () => {
    const response = ceRecorded({
      kind: 'incoming', ledgerRef: 'CE-001', thb: 10000,
      usdt: 232.56, adminName: '<admin>',
    });
    expect(response).toContain('Deposit Recorded / 入账已记录');
    expect(response).toContain('Settlement not verified / 尚未结算确认');
    expect(response).not.toContain('Settlement สำเร็จ');
    expect(response).toContain('&lt;admin&gt;');
  });
  it('provides multilingual labels without changing amounts or transaction meaning', () => {
    const ocr = ceOcrAmount(1200, 94);
    expect(ocr).toContain('Extracted Amount / 识别金额');
    expect(ocr).toContain('Not yet verified / 尚未核实');
    const receipt = ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-XYZ', usdt: 12.3456 });
    expect(receipt).toContain('Transfer Recorded / 转出已记录');
    expect(receipt).toContain('Reference / 交易编号');
    expect(receipt).toContain('12.3456 USDT');
    expect(receipt).not.toContain('Settlement complete');
  });
  it('does not interpolate preview account or amount into a live reply', () => {
    expect(ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-XYZ', usdt: 3.25 }))
      .toContain('3.25 USDT');
    expect(ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-XYZ', usdt: 3.25 }))
      .not.toContain('232.56');
  });
});
