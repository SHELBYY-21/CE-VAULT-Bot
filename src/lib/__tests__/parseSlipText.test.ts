import { describe, it, expect } from 'vitest';
import { parseSlipText, computeShouldSend } from '../parseSlipText';

describe('parseSlipText', () => {
  describe('Basic parsing', () => {
    it('parses amount from Thai text', () => {
      const text = 'โอน 5,000 บาท SCB 3376';
      const result = parseSlipText(text);
      expect(result.amount).toBe(5000);
    });

    it('parses bank name', () => {
      const text = 'โอน 5,000 บาท SCB 3376';
      const result = parseSlipText(text);
      expect(result.bank).toBe('SCB');
    });

    it('parses last4 digits', () => {
      const text = 'โอน 5,000 บาท SCB 3376';
      const result = parseSlipText(text);
      expect(result.last4).toBe('3376');
    });

    it('parses date', () => {
      const text = 'วันที่ 24/07/26';
      const result = parseSlipText(text);
      expect(result.date).toBe('24/07/26');
    });

    it('parses time', () => {
      const text = 'เวลา 14:30';
      const result = parseSlipText(text);
      expect(result.time).toBe('14:30');
    });
  });

  describe('Edge cases', () => {
    it('handles amounts with commas', () => {
      const text = 'โอน 1,000,000 บาท SCB 1234';
      const result = parseSlipText(text);
      expect(result.amount).toBe(1000000);
    });

    it('handles amounts with decimals', () => {
      const text = 'โอน 1,234.56 บาท KBANK 5678';
      const result = parseSlipText(text);
      expect(result.amount).toBe(1234.56);
    });

    it('handles missing fields gracefully', () => {
      const text = 'Random text without slip data';
      const result = parseSlipText(text);
      expect(result.amount).toBeNull();
      expect(result.bank).toBeNull();
      expect(result.last4).toBeNull();
      expect(result.date).toBeNull();
      expect(result.time).toBeNull();
    });

    it('handles empty string', () => {
      const result = parseSlipText('');
      expect(result.amount).toBeNull();
      expect(result.bank).toBeNull();
    });

    it('handles null input', () => {
      const result = parseSlipText(null as unknown as string);
      expect(result.amount).toBeNull();
    });

    it('extracts last4 from various formats', () => {
      expect(parseSlipText('SCB xxxx1234').last4).toBe('1234');
      expect(parseSlipText('SCB ****1234').last4).toBe('1234');
      expect(parseSlipText('SCB 1234').last4).toBe('1234');
    });

    it('parses KBANK', () => {
      expect(parseSlipText('KBANK 1234').bank).toBe('KBANK');
    });

    it('parses CIMB', () => {
      expect(parseSlipText('CIMB 1234').bank).toBe('CIMB');
    });

    it('parses TrueMoney (TMN)', () => {
      expect(parseSlipText('TrueMoney xxxx4567').bank).toBe('TMN');
    });
  });
});

describe('computeShouldSend', () => {
  it('calculates USDT from THB and rate', () => {
    expect(computeShouldSend(5000, 33.6)).toBe(148.81);
    expect(computeShouldSend(1000, 35.5)).toBe(28.17);
  });

  it('returns 0 for invalid inputs', () => {
    expect(computeShouldSend(0, 33.6)).toBe(0);
    expect(computeShouldSend(5000, 0)).toBe(0);
    expect(computeShouldSend(-5000, 33.6)).toBe(0);
    expect(computeShouldSend(5000, -33.6)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(computeShouldSend(1000, 3)).toBe(333.33);
    expect(computeShouldSend(1, 3)).toBe(0.33);
  });
});
