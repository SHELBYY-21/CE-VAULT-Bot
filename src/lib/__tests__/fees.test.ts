import { describe, it, expect } from 'vitest';
import { calculateFee } from '../fees';

describe('calculateFee', () => {
  it('computes expected USDT, fee and fee percent', () => {
    const r = calculateFee(5000, 33.6, 140);
    expect(r.expectedUsdt).toBeCloseTo(148.809523, 4);
    expect(r.feeUsdt).toBeCloseTo(8.809523, 4);
    expect(r.feePercent).toBeCloseTo(5.92, 2);
  });

  it('returns a negative fee when actual exceeds expected', () => {
    const r = calculateFee(5000, 33.6, 160);
    expect(r.feeUsdt).toBeLessThan(0);
  });

  it('guards against marketUsdtRate=0', () => {
    const r = calculateFee(5000, 0, 140);
    expect(r.expectedUsdt).toBe(0);
    expect(r.feePercent).toBe(0);
  });
});
