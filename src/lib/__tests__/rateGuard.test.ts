import { describe, it, expect } from 'vitest';
import { assertFiniteRate } from '../rateGuard';

describe('assertFiniteRate (ledger integrity)', () => {
  it('accepts finite rates', () => {
    expect(assertFiniteRate(32.49, 'sell_rate')).toBe(32.49);
    expect(assertFiniteRate(34.8, 'market_usdt_rate')).toBe(34.8);
  });

  it('rejects NaN from a missing env fallback (Number(undefined env))', () => {
    // This is exactly the /rate handler failure mode: Number(process.env.X) ?? fallback
    expect(() => assertFiniteRate(Number(undefined), 'market_usdt_rate')).toThrow(/finite/);
    expect(() => assertFiniteRate(Number('not-a-number'), 'sell_rate')).toThrow(/finite/);
  });

  it('rejects Infinity and non-number inputs', () => {
    expect(() => assertFiniteRate(Infinity, 'market_usdt_rate')).toThrow(/finite/);
    expect(() => assertFiniteRate(-Infinity, 'sell_rate')).toThrow(/finite/);
    expect(() => assertFiniteRate('34.8' as unknown as number, 'sell_rate')).toThrow(/finite/);
  });
});
