import { describe, it, expect } from 'vitest';
import { calculateProfit, calculateDepositProfit } from '../profit';

describe('calculateProfit (sell model)', () => {
  it('computes cost, sell value, net profit and percent', () => {
    const r = calculateProfit(5000, 140, 35.5);
    expect(r.costPerUnit).toBeCloseTo(35.7142857, 4);
    expect(r.sellValueThb).toBe(4970);
    expect(r.netProfitThb).toBe(-30);
    expect(r.profitPercent).toBeCloseTo(-0.6, 6);
  });

  it('reports positive profit when sell rate beats cost', () => {
    const r = calculateProfit(5000, 150, 35.5);
    expect(r.sellValueThb).toBe(5325);
    expect(r.netProfitThb).toBe(325);
    expect(r.profitPercent).toBeCloseTo(6.5, 6);
  });

  it('guards against divide-by-zero (usdt=0 -> costPerUnit 0)', () => {
    const r = calculateProfit(5000, 0, 35.5);
    expect(r.costPerUnit).toBe(0);
    expect(r.sellValueThb).toBe(0);
  });

  it('guards against thb=0 (percent 0)', () => {
    const r = calculateProfit(0, 140, 35.5);
    expect(r.profitPercent).toBe(0);
  });
});

describe('calculateDepositProfit (deposit model: profit = THB - USDT*marketRate)', () => {
  it('matches the deposit business math', () => {
    const r = calculateDepositProfit(5000, 140, 33.6);
    expect(r.costPerUnit).toBe(33.6);
    expect(r.sellValueThb).toBe(5000);
    expect(r.netProfitThb).toBeCloseTo(296, 6);
    expect(r.profitPercent).toBeCloseTo(5.92, 6);
  });

  it('percent is 0 when thb is 0', () => {
    const r = calculateDepositProfit(0, 140, 33.6);
    expect(r.profitPercent).toBe(0);
  });
});
