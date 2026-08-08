import { describe, it, expect } from 'vitest';
import { parseAmounts, parseAmountTokens } from '../amounts';

describe('parseAmountTokens', () => {
  it('reads a signed THB token', () => {
    const [t] = parseAmountTokens('+5000');
    expect(t).toMatchObject({ sign: 1, value: 5000, currency: 'THB' });
  });

  it('reads a signed USDT token', () => {
    const [t] = parseAmountTokens('-140');
    expect(t).toMatchObject({ sign: -1, value: 140, currency: 'USDT' });
  });

  it('reads two tokens with explicit units and commas', () => {
    const tokens = parseAmountTokens('+1,000B -13.6U');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ value: 1000, currency: 'THB' });
    expect(tokens[1]).toMatchObject({ value: 13.6, currency: 'USDT' });
  });

  it('honours explicit Thai/units over the sign default', () => {
    const [t] = parseAmountTokens('+13.6U');
    expect(t.currency).toBe('USDT');
  });

  it('ignores zero and non-positive values', () => {
    expect(parseAmountTokens('+0')).toHaveLength(0);
  });
});

describe('parseAmounts', () => {
  it('separates THB and USDT tokens', () => {
    const r = parseAmounts('+500B -13.6U');
    expect(r.thb?.value).toBe(500);
    expect(r.usdt?.value).toBe(13.6);
    expect(r.hasBareNumber).toBe(false);
  });

  it('flags a bare number with no sign/unit', () => {
    const r = parseAmounts('500');
    expect(r.thb).toBeUndefined();
    expect(r.usdt).toBeUndefined();
    expect(r.hasBareNumber).toBe(true);
  });

  it('applies sign-based default currency', () => {
    const inbound = parseAmounts('+5000');
    expect(inbound.thb?.value).toBe(5000);
    const outbound = parseAmounts('-140');
    expect(outbound.usdt?.value).toBe(140);
  });
});
