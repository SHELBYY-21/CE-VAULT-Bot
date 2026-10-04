/**
 * CE VAULT dashboard session boundary (presentation access, not ledger logic).
 * Requires separate server-only DASHBOARD_ACCESS_PASSPHRASE and
 * DASHBOARD_SESSION_SECRET. Missing/weak configuration fails closed.
 */
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const DASHBOARD_COOKIE = 'ce_vault_dashboard';
export const DASHBOARD_TTL_SECONDS = 4 * 60 * 60;
const MIN_SECRET = 32;
const MIN_PASSPHRASE = 12;

function secret(): string | null {
  const value = process.env.DASHBOARD_SESSION_SECRET ?? '';
  return value.length >= MIN_SECRET ? value : null;
}
function passphrase(): string | null {
  const value = process.env.DASHBOARD_ACCESS_PASSPHRASE ?? '';
  return value.length >= MIN_PASSPHRASE ? value : null;
}
export function dashboardAuthConfigured(): boolean {
  return secret() !== null && passphrase() !== null;
}
/** Names (never values) of server settings that are missing or too short. */
export function dashboardAuthMissing(): string[] {
  const missing: string[] = [];
  if (passphrase() === null) missing.push(`DASHBOARD_ACCESS_PASSPHRASE (>= ${MIN_PASSPHRASE} chars)`);
  if (secret() === null) missing.push(`DASHBOARD_SESSION_SECRET (>= ${MIN_SECRET} chars)`);
  return missing;
}
export function checkDashboardPassphrase(input: unknown): boolean {
  const expected = passphrase();
  if (!expected || typeof input !== 'string' || input.length > 512) return false;
  const lhs = createHash('sha256').update(input).digest();
  const rhs = createHash('sha256').update(expected).digest();
  return timingSafeEqual(lhs, rhs);
}
function mac(value: string, key: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
export function issueDashboardSession(now = Date.now()): string | null {
  const key = secret();
  if (!key || !dashboardAuthConfigured()) return null;
  const payload = Buffer.from(JSON.stringify({
    v: 1, exp: now + DASHBOARD_TTL_SECONDS * 1000,
    nonce: randomBytes(16).toString('base64url'),
  })).toString('base64url');
  return payload + '.' + mac(payload, key).toString('base64url');
}
export function validDashboardSession(value: unknown, now = Date.now()): boolean {
  const key = secret();
  if (!key || typeof value !== 'string' || value.length > 1024) return false;
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const provided = Buffer.from(parts[1], 'base64url');
  const expected = mac(parts[0], key);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return data.v === 1 &&
      typeof data.exp === 'number' && Number.isFinite(data.exp) &&
      data.exp > now && data.exp <= now + DASHBOARD_TTL_SECONDS * 1000 &&
      typeof data.nonce === 'string' && /^[A-Za-z0-9_-]{20,32}$/.test(data.nonce);
  } catch {
    return false;
  }
}
