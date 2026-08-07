// basic mocked e2e test (jest)
import { parseSlipText, computeShouldSend } from '../src/bot/parse';

describe('parseSlipText', () => {
  test('parse simple thai slip text', () => {
    const text = 'ยอด 5,000 บาท ธนาคาร CIMB 2330 วันที่ 24/07/26 ผู้รับ นางสาว อัญยา ระดาบุตร';
    const p = parseSlipText(text);

    expect(p.amount).toBe(5000);
    expect(p.bank).toBe('CIMB');
    expect(p.last4).toBe('2330');
    expect(p.receiverName).toBe('อัญยา ระดาบุตร');
    expect(p.date).toBe('24/07/26');
  });

  test('parse slip with promptpay or kbank', () => {
    const text = 'โอนสำเร็จ 12,500.50 THB ธนาคาร KBANK xxxx1234 เวลา 14:30';
    const p = parseSlipText(text);

    expect(p.amount).toBe(12500.5);
    expect(p.bank).toBe('KBANK');
    expect(p.last4).toBe('1234');
    expect(p.time).toBe('14:30');
  });
});

describe('computeShouldSend', () => {
  test('computes usdt correctly', () => {
    expect(computeShouldSend(5000, 42)).toBe(119.05);
    expect(computeShouldSend(1000, 35.5)).toBe(28.17);
    expect(computeShouldSend(0, 35.5)).toBe(0);
  });
});
