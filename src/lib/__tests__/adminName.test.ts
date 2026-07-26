import { describe, expect, it } from 'vitest';
import { isValidAdminName, parseAdminCommand } from '../adminName';

describe('parseAdminCommand', () => {
  it('matches /admin with a name', () => {
    expect(parseAdminCommand('/admin แอดมิน A')).toEqual({
      matched: true,
      name: 'แอดมิน A',
    });
  });

  it('matches /admin@BotName', () => {
    expect(parseAdminCommand('/admin@CEboi88bot RAZEN')).toEqual({
      matched: true,
      name: 'RAZEN',
    });
  });

  it('matches bare /admin (empty name)', () => {
    expect(parseAdminCommand('/admin')).toEqual({ matched: true, name: '' });
    expect(parseAdminCommand('/admin@CEboi88bot')).toEqual({ matched: true, name: '' });
  });

  it('does not match plain names or other commands', () => {
    expect(parseAdminCommand('แอดมิน A')).toEqual({ matched: false });
    expect(parseAdminCommand('/start')).toEqual({ matched: false });
    expect(parseAdminCommand('/setroom ห้อง A')).toEqual({ matched: false });
  });
});

describe('isValidAdminName', () => {
  it('accepts normal display names', () => {
    expect(isValidAdminName('แอดมิน A')).toBe(true);
    expect(isValidAdminName('RAZEN')).toBe(true);
    expect(isValidAdminName('Staff 01')).toBe(true);
  });

  it('rejects empty / numeric / amount-like', () => {
    expect(isValidAdminName('')).toBe(false);
    expect(isValidAdminName('150')).toBe(false);
    expect(isValidAdminName('13.6')).toBe(false);
    expect(isValidAdminName('+500')).toBe(false);
    expect(isValidAdminName('-13.6')).toBe(false);
  });
});
