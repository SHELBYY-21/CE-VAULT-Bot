import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkDashboardPassphrase, dashboardAuthConfigured, issueDashboardSession,
  DASHBOARD_TTL_SECONDS, validDashboardSession,
} from '../dashboardSession';

const oldPass = process.env.DASHBOARD_ACCESS_PASSPHRASE;
const oldSecret = process.env.DASHBOARD_SESSION_SECRET;
beforeEach(() => {
  process.env.DASHBOARD_ACCESS_PASSPHRASE = 'correct-horse-battery-staple';
  process.env.DASHBOARD_SESSION_SECRET = '0123456789abcdef0123456789abcdef';
});
afterEach(() => {
  if (oldPass === undefined) delete process.env.DASHBOARD_ACCESS_PASSPHRASE;
  else process.env.DASHBOARD_ACCESS_PASSPHRASE = oldPass;
  if (oldSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
  else process.env.DASHBOARD_SESSION_SECRET = oldSecret;
});
describe('CE Vault signed Dashboard sessions', () => {
  it('fails closed when either required server-only value is missing', () => {
    delete process.env.DASHBOARD_SESSION_SECRET;
    expect(dashboardAuthConfigured()).toBe(false);
    expect(issueDashboardSession()).toBe(null);
    expect(validDashboardSession('fake')).toBe(false);
  });
  it('accepts only the configured passphrase', () => {
    expect(checkDashboardPassphrase('wrong')).toBe(false);
    expect(checkDashboardPassphrase('correct-horse-battery-staple')).toBe(true);
    expect(checkDashboardPassphrase(1)).toBe(false);
  });
  it('accepts a valid signed session until expiration', () => {
    const now = Date.now();
    const signed = issueDashboardSession(now);
    expect(signed).not.toBe(null);
    expect(validDashboardSession(signed, now)).toBe(true);
    expect(validDashboardSession(signed, now + DASHBOARD_TTL_SECONDS * 1000)).toBe(false);
  });
  it('rejects tampering and secret rotation', () => {
    const signed = issueDashboardSession();
    expect(signed).not.toBe(null);
    expect(validDashboardSession(String(signed) + 'x')).toBe(false);
    process.env.DASHBOARD_SESSION_SECRET = 'fedcba9876543210fedcba9876543210';
    expect(validDashboardSession(signed)).toBe(false);
  });
});
