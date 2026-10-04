import { describe, it, expect } from 'vitest';
import {
  last4OfAccount,
  normalizeBankCode,
  matchesPinnedBank,
  findMatchingPinnedBank,
  bangkokDate,
  MAX_PINNED_TODAY,
} from '../banks';

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
  it('maps aliases including TMN / case-insensitive pin codes', () => {
    expect(normalizeBankCode('กสิกรไทย')).toBe('KBANK');
    expect(normalizeBankCode('kbank')).toBe('KBANK');
    expect(normalizeBankCode('SCB')).toBe('SCB');
    expect(normalizeBankCode('ktb')).toBe('KTB');
    expect(normalizeBankCode('bbl')).toBe('BBL');
    expect(normalizeBankCode('tmn')).toBe('TMN');
    expect(normalizeBankCode('TrueMoney')).toBe('TMN');
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

describe('findMatchingPinnedBank (up to 3)', () => {
  const pins = [
    { id: '1', bank_name: 'SCB', account_number: '111122223333', label: 'scb' },
    { id: '2', bank_name: 'KBANK', account_number: '1234567890', label: 'k' },
    { id: '3', bank_name: 'TMN', account_number: '0812345678', label: 'tmn' },
  ];

  it('finds matching pin among several', () => {
    expect(findMatchingPinnedBank({ bank: 'kbank', last4: '7890' }, pins)?.id).toBe('2');
    expect(findMatchingPinnedBank({ bank: 'TMN', last4: '5678' }, pins)?.id).toBe('3');
  });

  it('returns null when none match', () => {
    expect(findMatchingPinnedBank({ bank: 'BBL', last4: '9999' }, pins)).toBeNull();
  });

  it('caps documented max at 3', () => {
    expect(MAX_PINNED_TODAY).toBe(3);
  });
});

describe('bangkokDate', () => {
  it('returns YYYY-MM-DD', () => {
    expect(bangkokDate(new Date('2026-07-22T12:00:00+07:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
