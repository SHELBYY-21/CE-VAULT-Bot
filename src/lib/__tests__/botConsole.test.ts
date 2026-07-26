import { describe, expect, it } from 'vitest';
import { card, esc, metrics, money, pct, statusRail } from '../botConsole';
import { dealConfirm, incomingRecorded, slipUnclear } from '../botUi';

describe('statusRail', () => {
  it('glows only the active step', () => {
    const rail = statusRail('WAITING_USDT');
    expect(rail).toContain('<b>● WAITING USDT</b>');
    expect(rail).toContain('○ RECEIVED');
    expect(rail).toContain('○ OCR VERIFIED');
    expect(rail).toContain('<i>○ SETTLED</i>');
    expect(rail.match(/<b>●/g)?.length).toBe(1);
  });

  it('renders ERROR as a single glow', () => {
    expect(statusRail('ERROR')).toBe('<b>● ERROR</b>');
  });
});

describe('metrics / money', () => {
  it('formats numbers for monospace display', () => {
    expect(money(500)).toBe('500.00');
    expect(pct(1.38)).toBe('+1.38%');
    expect(metrics([{ label: 'THB', value: '500.00' }])).toContain('<code>500.00</code>');
  });

  it('escapes HTML in values', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
});

describe('card shell', () => {
  it('builds CE VAULT header + Secure Ledger', () => {
    const m = card({
      kind: 'OCR',
      ledgerId: 'CE-20260726-ABCD',
      status: 'OCR_VERIFIED',
      body: 'body',
    });
    expect(m.text).toContain('<b>CE VAULT</b>');
    expect(m.text).toContain('Secure Ledger');
    expect(m.text).toContain('Ledger  <code>#CE-20260726-ABCD</code>');
    expect(m.text).toContain('<b>● OCR VERIFIED</b>');
  });
});

describe('operation cards', () => {
  it('incomingRecorded is a single RECEIVE card', () => {
    const m = incomingRecorded({
      transactionId: 'tx1',
      ledgerRef: 'CE-20260726-1111',
      thb: 500,
      usdtOwed: 12.5342,
      sellRate: 40,
      adminName: 'RAZEN',
      bank: 'SCB',
      last4: '3376',
      confidence: 98.6,
      pinMatched: true,
    });
    expect(m.text).toContain('<code>RECEIVE</code>');
    expect(m.text).toContain('THB');
    expect(m.text).toContain('500.00');
    expect(m.text).toContain('SCB ••••3376');
    expect(m.text).toContain('98.6%');
    expect(m.text).toContain('<b>● OCR VERIFIED</b>');
    expect(m.text).not.toMatch(/🟢|🟡|🔴|✅|💵/);
  });

  it('dealConfirm exposes Confirm / Edit / Cancel', () => {
    const m = dealConfirm({
      ledgerRef: 'CE-20260726-2222',
      thb: 500,
      usdt: 12.5342,
      buyRate: 39.89,
      sellRate: 40,
      profitThb: 6.9,
      bank: 'SCB',
      last4: '3376',
    });
    expect(m.text).toContain('<code>CONFIRM</code>');
    expect(m.text).toContain('Buy Rate');
    expect(m.text).toContain('Sell Rate');
    expect(m.text).toContain('Profit');
    const kb = m.reply_markup as { inline_keyboard: { text: string }[][] };
    expect(kb.inline_keyboard[0].map((b) => b.text)).toEqual(['Confirm', 'Edit', 'Cancel']);
  });

  it('slipUnclear is a single OCR error card', () => {
    const m = slipUnclear(500);
    expect(m.text).toContain('<code>OCR</code>');
    expect(m.text).toContain('<b>● ERROR</b>');
    expect(m.text).toContain('+500');
  });
});
