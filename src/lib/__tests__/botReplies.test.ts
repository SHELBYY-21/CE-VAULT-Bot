import { describe, expect, it } from 'vitest';
import {
  roomControlCard,
  welcomeRegistered,
  outgoingRecorded,
  brandCard,
  pinStatusCard,
} from '../botUi';
import { ceRecorded } from '../ceReplyTheme';

describe('CE VAULT Telegram reply contract', () => {
  it('renders the room-specific menu without inventing a rate', () => {
    const menu = roomControlCard({ roomName: '<Room & A>', rate: null });
    expect(menu.text).toContain('&lt;Room &amp; A&gt;');
    expect(menu.text).toContain('ยังไม่ตั้งค่า');
    expect(menu.text).toContain('ยังไม่เชื่อมกับ Telegram PIN จริง');
    expect(JSON.stringify(menu.reply_markup)).toContain('ce:rate');
    expect(JSON.stringify(menu.reply_markup)).toContain('ce:bank');
    expect(JSON.stringify(menu.reply_markup)).toContain('ce:deposit');
    expect(JSON.stringify(menu.reply_markup)).toContain('ce:report');
  });

  it('shows a configured THB/USDT rate and escapes operator name', () => {
    expect(roomControlCard({ roomName: 'Room A', rate: 32.49 }).text).toContain('32.49 THB/USDT');
    expect(welcomeRegistered('<operator>').text).toContain('&lt;operator&gt;');
  });

  it('does not claim settlement merely because recorded outgoing equals expected', () => {
    const reply = outgoingRecorded({
      transactionId: 'tx-1', ledgerRef: 'CE-1', usdt: 10,
      adminName: 'A', remainingUsdt: 0,
    });
    expect(reply.text).toContain('บันทึกยอดส่งครบตามที่คำนวณ');
    expect(reply.text).toContain('ยังไม่ยืนยัน Settlement');
    expect(reply.text).not.toContain('(Settled)');
  });

  it('does not fabricate a network or claim transaction complete', () => {
    const reply = brandCard({ usdt: 10, ledgerRef: 'CE-1' });
    expect(reply.text).toContain('TRANSFER RECORDED');
    expect(reply.text).not.toContain('TRANSACTION COMPLETE');
    expect(reply.text).not.toContain('TRC-20');
    expect(reply.text).not.toContain('Net');
  });

  it('keeps outgoing recorded distinct from financial settlement', () => {
    const reply = ceRecorded({ kind: 'outgoing', ledgerRef: 'CE-1', usdt: 10 });
    expect(reply).toContain('Settlement not verified');
    expect(reply).not.toContain('Settlement complete');
  });

  it('labels legacy bank list as not Telegram pinned state', () => {
    const reply = pinStatusCard({ today: '2026-09-29', banks: [{
      label: 'bank', bank_name: 'SCB', account_number: '12345678', current_balance: 0,
    }] });
    expect(reply.text).toContain('ยังไม่เชื่อม Telegram PIN');
  });
});
