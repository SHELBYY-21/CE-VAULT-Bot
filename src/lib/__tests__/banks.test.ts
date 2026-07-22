import { describe, it, expect } from 'vitest';
import { last4OfAccount, normalizeBankCode, matchesPinnedBank, bangkokDate } from '../banks';

describe('last4OfAccount', () => {
  it('extracts last 4 digits', () => {
    expect(last4OfAccount('123-4-56789-0')).toBe('7890');
    expect(last4OfAccount('****6578')).toBe('6578');
  });
  it('returns null when too short', () => {
    expect(last4OfAccount('12')).toBeNull();
    expect(last4OfAccount(null)).toBeNull();
  });
});

describe('normalizeBankCode', () => {
  it('maps common aliases', () => {
    expect(normalizeBankCode('กสิกรไทย')).toBe('KBANK');
    expect(normalizeBankCode('Kasikorn')).toBe('KBANK');
    expect(normalizeBankCode('scb')).toBe('SCB');
  });
});

describe('matchesPinnedBank', () => {
  const pin = { bank_name: 'KBANK', account_number: '1234567890' };

  it('matches last4 + bank', () => {
    expect(matchesPinnedBank({ bank: 'กสิกร', last4: '7890' }, pin)).toBe(true);
  });

  it('rejects wrong last4', () => {
    expect(matchesPinnedBank({ bank: 'KBANK', last4: '0000' }, pin)).toBe(false);
  });

  it('rejects bank mismatch when both present', () => {
    expect(matchesPinnedBank({ bank: 'SCB', last4: '7890' }, pin)).toBe(false);
  });

  it('allows missing slip bank when last4 matches', () => {
    expect(matchesPinnedBank({ bank: null, last4: '7890' }, pin)).toBe(true);
  });
});

describe('bangkokDate', () => {
  it('returns YYYY-MM-DD', () => {
    expect(bangkokDate(new Date('2026-07-22T12:00:00+07:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
