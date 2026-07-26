import { describe, expect, it } from 'vitest';
import { dealConfirm, uploading, waitUsdt } from '../botUi';

/** Buy Rate = THB ÷ USDT (same formula as presentDealConfirm / recordDeal) */
function buyRate(thb: number, usdt: number): number {
  return usdt > 0 ? thb / usdt : 0;
}

describe('deal flow formulas', () => {
  it('computes Buy Rate as THB ÷ USDT', () => {
    expect(buyRate(500, 12.5342)).toBeCloseTo(39.89, 2);
    expect(buyRate(5000, 125)).toBe(40);
  });

  it('Confirmation Card shows Buy Rate · Sell Rate · Ledger ID', () => {
    const thb = 500;
    const usdt = 12.5342;
    const br = buyRate(thb, usdt);
    const sell = 40;
    const m = dealConfirm({
      ledgerRef: 'CE-20260726-LIVE',
      thb,
      usdt,
      buyRate: br,
      sellRate: sell,
      profitThb: usdt * sell - thb,
      bank: 'SCB',
      last4: '3376',
      confidence: 98.6,
      historyLine: 'Receiver  <code>KNOWN</code>',
    });
    expect(m.text).toContain('CE-20260726-LIVE');
    expect(m.text).toContain('Buy Rate');
    expect(m.text).toContain('THB ÷ USDT');
    expect(m.text).toContain('Sell Rate');
    expect(m.text).toContain('OCR Confidence');
    expect(m.text).toContain('3376');
    expect(m.text).toContain('KNOWN');
    const kb = m.reply_markup as { inline_keyboard: { text: string }[][] };
    expect(kb.inline_keyboard[0].map((b) => b.text)).toEqual(['Confirm', 'Edit', 'Cancel']);
  });
});

describe('Live Card frames', () => {
  it('uploading advances status without emoji spam', () => {
    const a = uploading(0);
    const b = uploading(1);
    expect(a.text).toContain('RECEIVED');
    expect(b.text).toContain('Reading Thai bank slip');
    expect(a.text).not.toMatch(/🟢|🟡|✅/);
  });

  it('waitUsdt OCR card includes confidence · last4 · sell rate · ledger', () => {
    const m = waitUsdt({
      thb: 500,
      bank: 'SCB',
      last4: '3376',
      confidence: 97.2,
      ledgerRef: 'CE-20260726-OCR1',
      roomRate: 40,
      pinMatched: true,
      historyLine: 'New receiver',
    });
    expect(m.text).toContain('OCR Confidence');
    expect(m.text).toContain('97.2%');
    expect(m.text).toContain('Last4');
    expect(m.text).toContain('3376');
    expect(m.text).toContain('Sell Rate');
    expect(m.text).toContain('CE-20260726-OCR1');
    expect(m.text).toContain('<b>● WAITING USDT</b>');
  });
});
