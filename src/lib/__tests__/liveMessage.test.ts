import { describe, expect, it } from 'vitest';
import {
  liveCard,
  liveRail,
  liveReceiving,
  liveSettled,
  liveWaiting,
} from '../liveMessage';

describe('liveRail', () => {
  it('highlights Receiving first', () => {
    const rail = liveRail('RECEIVING');
    expect(rail).toContain('<b>● Receiving...</b>');
    expect(rail).toContain('<i>○ OCR</i>');
    expect(rail).toContain('<i>○ Verified</i>');
    expect(rail).toContain('<i>○ Waiting</i>');
    expect(rail).toContain('<i>○ Settled</i>');
    expect(rail.match(/<b>●/g)?.length).toBe(1);
  });

  it('marks past steps with checkmarks when Waiting', () => {
    const rail = liveRail('WAITING');
    expect(rail).toContain('✓ Receiving...');
    expect(rail).toContain('✓ OCR');
    expect(rail).toContain('✓ Verified');
    expect(rail).toContain('<b>● Waiting</b>');
    expect(rail).toContain('<i>○ Settled</i>');
  });

  it('ends on Settled', () => {
    const rail = liveRail('SETTLED');
    expect(rail).toContain('<b>● Settled</b>');
    expect(rail).toContain('✓ Waiting');
  });
});

describe('liveCard', () => {
  it('is a single Live Message shell', () => {
    const m = liveCard({ stage: 'OCR', ledgerRef: 'CE-20260726-ABCD', body: 'reading' });
    expect(m.text).toContain('<b>CE VAULT</b>');
    expect(m.text).toContain('Live Message');
    expect(m.text).toContain('<b>● OCR</b>');
    expect(m.text).toContain('#CE-20260726-ABCD');
    expect(m.text).toContain('reading');
  });

  it('liveReceiving / liveWaiting / liveSettled stages', () => {
    expect(liveReceiving('CE-1').text).toContain('Receiving...');
    expect(liveWaiting({ ledgerRef: 'CE-1', thb: 500 }).text).toContain('<b>● Waiting</b>');
    expect(liveSettled({ ledgerRef: 'CE-1', thb: 500, usdt: 12.5 }).text).toContain(
      '<b>● Settled</b>',
    );
  });
});
