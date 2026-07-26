import { describe, expect, it } from 'vitest';
import { isValidAdminName, parseAdminCommand } from '../adminName';

describe('parseAdminCommand', () => {
  it('matches /admin with a name', () => {
    expect(parseAdminCommand('/admin Operator A')).toEqual({
      matched: true,
      name: 'Operator A',
    });
  });

  it('matches /admin@BotName', () => {
    expect(parseAdminCommand('/admin@CEboi88bot RAZEN')).toEqual({
      matched: true,
      name: 'RAZEN',
    });
  });

  it('rejects plain names', () => {
    expect(parseAdminCommand('Operator A')).toEqual({ matched: false });
  });
});

describe('isValidAdminName', () => {
  it('rejects numeric amounts', () => {
    expect(isValidAdminName('150')).toBe(false);
    expect(isValidAdminName('+500')).toBe(false);
  });

  it('accepts display names', () => {
    expect(isValidAdminName('RAZEN')).toBe(true);
  });
});
