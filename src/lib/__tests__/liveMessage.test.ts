import { describe, expect, it } from 'vitest';
import {
  intelBlock,
  liveCard,
  liveRail,
  liveReceiving,
  liveRecorded,
  liveSettled,
  liveWaiting,
  receiverIntelCard,
} from '../liveMessage';
import { toReceiverIntel } from '../receiverIntel';

describe('liveRail', () => {
  it('highlights Receiving first', () => {
    const rail = liveRail('RECEIVING');
    expect(rail).toContain('<b>● Receiving...</b>');
    expect(rail).toContain('<i>○ OCR</i>');
    expect(rail).toContain('<i>○ Match</i>');
    expect(rail).toContain('<i>○ Recorded</i>');
    expect(rail).toContain('<i>○ Waiting</i>');
    expect(rail).toContain('<i>○ Done</i>');
    expect(rail.match(/<b>●/g)?.length).toBe(1);
  });

  it('marks past steps with checkmarks when Waiting', () => {
    const rail = liveRail('WAITING');
    expect(rail).toContain('✓ Receiving...');
    expect(rail).toContain('✓ OCR');
    expect(rail).toContain('✓ Match');
    expect(rail).toContain('✓ Recorded');
    expect(rail).toContain('<b>● Waiting</b>');
    expect(rail).toContain('<i>○ Done</i>');
  });

  it('separates Recorded from final Done', () => {
    const recorded = liveRail('RECORDED');
    expect(recorded).toContain('<b>● Recorded</b>');
    expect(recorded).toContain('<i>○ Waiting</i>');
    expect(recorded).toContain('<i>○ Done</i>');

    const settled = liveRail('SETTLED');
    expect(settled).toContain('<b>● Done</b>');
    expect(settled).toContain('✓ Waiting');
  });
});

describe('liveCard', () => {
  it('is a single Live Message shell', () => {
    const m = liveCard({ stage: 'OCR', ledgerRef: 'CE-20260726-ABCD', body: 'reading' });
    expect(m.text).toContain('<b>◈ CE VAULT</b>');
    expect(m.text).toContain('Live Message');
    expect(m.text).toContain('<b>● OCR</b>');
    expect(m.text).toContain('#CE-20260726-ABCD');
    expect(m.text).toContain('reading');
  });

  it('liveReceiving / liveWaiting / liveRecorded / liveSettled stages', () => {
    expect(liveReceiving('CE-1').text).toContain('Receiving');
    expect(liveWaiting({ ledgerRef: 'CE-1', thb: 500 }).text).toContain('<b>● Waiting</b>');

    const recorded = liveRecorded({ ledgerRef: 'CE-1', thb: 500, usdt: 12.5 });
    expect(recorded.text).toContain('◈ CE · RECORDED (已记录) ✓');
    expect(recorded.text).toContain('Settlement not verified / 尚未结算确认');

    const settled = liveSettled({ ledgerRef: 'CE-1', usdt: 12.5 });
    expect(settled.text).toContain('◈ CE · DONE ✓');
    expect(settled.text).toContain('SETTLED');
  });

  it('renders Receiver Intelligence block', () => {
    const intel = toReceiverIntel(
      {
        id: 'r1',
        bank: 'SCB',
        receiver_name: null,
        account_last4: '3376',
        total_transactions: 52,
        total_amount_thb: 1_200_000,
        total_usdt: 0,
        max_amount_thb: 1,
        last_amount_thb: 1,
        first_transaction_at: null,
        last_transaction_at: '2026-07-26T13:00:00+07:00',
        last_ledger_ref: null,
        status: 'trusted',
      },
      '3376',
    );
    const block = intelBlock(intel);
    expect(block).toContain('SCB •3376');
    expect(block).toContain('Transactions');
    expect(block).toContain('52');
    expect(block).toContain('Duplicate');
    expect(block).toContain('No');
    expect(receiverIntelCard(intel).text).toContain('History');
    expect(receiverIntelCard(intel).text).toContain('3376');
  });
});
