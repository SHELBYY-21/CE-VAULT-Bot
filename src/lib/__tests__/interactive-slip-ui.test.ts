import { describe, expect, it } from 'vitest';
import {
  interactiveSlipReceived,
  interactiveSlipChecking,
  interactiveSlipComplete,
} from '../botUi';

describe('interactive slip UI', () => {
  it('received card shows queue + cancel', () => {
    const m = interactiveSlipReceived();
    expect(m.text).toContain('รับสลิปแล้ว');
    expect(m.text).toContain('15%');
    expect(m.reply_markup).toBeTruthy();
  });

  it('checking card progresses OCR phase', () => {
    const low = interactiveSlipChecking(20);
    const mid = interactiveSlipChecking(50);
    const high = interactiveSlipChecking(80);
    expect(low.text).toContain('กำลังตรวจสอบ');
    expect(low.text).toContain('อัปโหลดรูปสลิป');
    expect(mid.text).toContain('Grok Vision');
    expect(high.text).toContain('จับคู่บัญชี');
    expect(high.text).toContain('80%');
  });

  it('complete card is 100% with today button', () => {
    const m = interactiveSlipComplete({
      thb: 5000,
      usdt: 125,
      bank: 'KBANK',
      last4: '7890',
      confidence: 95,
      ledgerRef: 'CE-20260724-ABCD',
      transactionId: 'tx-1',
      pinMatched: true,
    });
    expect(m.text).toContain('100%');
    expect(m.text).toContain('5,000');
    expect(m.text).toMatch(/ปักหมุด|ตรงบัญชี pin/);
    const kb = (m.reply_markup as { inline_keyboard: { callback_data?: string }[][] }).inline_keyboard;
    expect(kb.flat().some((b) => b.callback_data === 'menu_today:1')).toBe(true);
  });
});
