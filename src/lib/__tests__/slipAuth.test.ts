import { describe, expect, it } from 'vitest';
import {
  authenticityBlock,
  authLabel,
  CLEAN_AUTH,
  isAuthClean,
  mergeAuthenticity,
  parseAuthBool,
  slipFingerprint,
} from '../slipAuth';

describe('slipAuth', () => {
  it('labels true as Yes and false as No', () => {
    expect(authLabel(true)).toBe('Yes');
    expect(authLabel(false)).toBe('No');
  });

  it('renders authenticity block with No/No/No when clean', () => {
    const block = authenticityBlock(CLEAN_AUTH);
    expect(block).toContain('Forged     <code>No</code>');
    expect(block).toContain('Edited     <code>No</code>');
    expect(block).toContain('Duplicate  <code>No</code>');
    expect(isAuthClean(CLEAN_AUTH)).toBe(true);
  });

  it('is dirty when any flag is Yes', () => {
    expect(isAuthClean({ forged: true, edited: false, duplicate: false })).toBe(false);
    expect(isAuthClean({ forged: false, edited: true, duplicate: false })).toBe(false);
    expect(isAuthClean({ forged: false, edited: false, duplicate: true })).toBe(false);
  });

  it('parses yes/no style strings', () => {
    expect(parseAuthBool('Yes')).toBe(true);
    expect(parseAuthBool('no')).toBe(false);
    expect(parseAuthBool(1)).toBe(true);
    expect(parseAuthBool(undefined)).toBe(false);
  });

  it('merges vision flags with DB duplicate hit', () => {
    expect(mergeAuthenticity({ forged: false, edited: false, duplicate: false }, true)).toEqual({
      forged: false,
      edited: false,
      duplicate: true,
    });
    expect(mergeAuthenticity({ forged: true, edited: false, duplicate: false }, false)).toEqual({
      forged: true,
      edited: false,
      duplicate: false,
    });
  });

  it('fingerprints same slip content stably', () => {
    const a = slipFingerprint({
      thb: 1500,
      date: '26/07/26',
      time: '14:30',
      bank: 'kbank',
      last4: '1234',
    });
    const b = slipFingerprint({
      thb: 1500,
      date: '26/07/26',
      time: '14:30',
      bank: 'KBANK',
      last4: 'xx1234',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);

    const c = slipFingerprint({
      thb: 1501,
      date: '26/07/26',
      time: '14:30',
      bank: 'KBANK',
      last4: '1234',
    });
    expect(c).not.toBe(a);
  });
});
