import { describe, it, expect } from 'vitest';
import { convertThbUsdt, parseConvertQuery } from '../convert';

describe('convertThbUsdt', () => {
  it('converts THB to USDT at the given rate', () => {
    const r = convertThbUsdt(5000, 'THB', 35.5);
    expect(r.outputCurrency).toBe('USDT');
    expect(r.outputAmount).toBeCloseTo(140.845070, 4);
    expect(r.rate).toBe(35.5);
  });

  it('converts USDT to THB at the given rate', () => {
    const r = convertThbUsdt(100, 'USDT', 35.5);
    expect(r.outputCurrency).toBe('THB');
    expect(r.outputAmount).toBeCloseTo(3550, 4);
  });

  it('rejects a non-positive amount', () => {
    expect(() => convertThbUsdt(0, 'THB', 35.5)).toThrow();
    expect(() => convertThbUsdt(-5, 'THB', 35.5)).toThrow();
  });

  it('rejects a non-positive rate', () => {
    expect(() => convertThbUsdt(5000, 'THB', 0)).toThrow();
  });
});

describe('parseConvertQuery', () => {
  it('defaults to THB when no currency given', () => {
    expect(parseConvertQuery('5000')).toEqual({ amount: 5000, currency: 'THB' });
  });

  it('parses THB explicitly', () => {
    expect(parseConvertQuery('5,000 thb')).toEqual({ amount: 5000, currency: 'THB' });
    expect(parseConvertQuery('5000 บาท')).toEqual({ amount: 5000, currency: 'THB' });
  });

  it('parses USDT explicitly', () => {
    expect(parseConvertQuery('100 usdt')).toEqual({ amount: 100, currency: 'USDT' });
    expect(parseConvertQuery('100U')).toEqual({ amount: 100, currency: 'USDT' });
    expect(parseConvertQuery('100 ยู')).toEqual({ amount: 100, currency: 'USDT' });
  });

  it('returns null when there is no usable number', () => {
    expect(parseConvertQuery('')).toBeNull();
    expect(parseConvertQuery('thb')).toBeNull();
    expect(parseConvertQuery('-5 usdt')).toBeNull();
  });
});
