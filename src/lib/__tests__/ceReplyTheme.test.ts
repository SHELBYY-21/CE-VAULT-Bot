import { describe, expect, it } from 'vitest';
import { CE_MESSAGE_STATES, ceAmount, ceEscape, ceMessage, ceRecorded } from '../ceReplyTheme';

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
  it('does not call an incoming deposit a settled transfer', () => {
    const response = ceRecorded({
      kind: 'incoming', ledgerRef: 'CE-001', thb: 10000,
      usdt: 232.56, adminName: '<admin>',
    });
    expect(response).toContain('บันทึกเงินเข้าแล้ว');
    expect(response).toContain('ยังไม่ยืนยันว่า Settlement ครบ');
    expect(response).not.toContain('Settlement สำเร็จ');
    expect(response).toContain('&lt;admin&gt;');
  });
  it('does not interpolate preview account or amount into a live reply', () => {
    expect(ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-XYZ', usdt: 3.25 }))
      .toContain('3.25 USDT');
    expect(ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-XYZ', usdt: 3.25 }))
      .not.toContain('232.56');
  });
});
