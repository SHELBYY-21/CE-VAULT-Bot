import { describe, expect, it } from 'vitest';
import { DB2, DB2_DOMAINS, SCHEMA_VERSION } from '../db/schema';

describe('Database 2.0 schema', () => {
  it('defines 12 domain collections', () => {
    expect(DB2_DOMAINS).toHaveLength(12);
    expect(DB2_DOMAINS).toEqual(
      expect.arrayContaining([
        'staff',
        'receivers',
        'transactions',
        'ledger_entries',
        'rooms',
        'daily_rates',
        'ocr_runs',
        'images',
        'audit_logs',
        'wallets',
        'settlements',
        'analytics_daily',
      ]),
    );
  });

  it('keeps legacy collection names for compat reads', () => {
    expect(DB2.admins).toBe('admins');
    expect(DB2.chatSettings).toBe('chat_settings');
    expect(DB2.rates).toBe('rates');
    expect(DB2.bankAccounts).toBe('bank_accounts');
  });

  it('uses schema_version 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });
});
