import { createHash } from 'crypto';

// Commands that require admin access
const ADMIN_COMMANDS = new Set([
  'save_slip', 'pin', 'unpin', 'rate', 'setrate', 'newday', 'reset',
  'setroom', 'export', 'summary', 'recent_slips', 'receiver', 'today', 'ledger',
]);

/**
 * Extract command name from text (e.g., "/start" -> "start")
 * Handles bot mentions (e.g., "/start@cevault_bot" -> "start")
 */
export function commandName(text: string | null | undefined): string | null {
  const match = (text ?? '').trim().match(/^\/([a-z_]+)(?:@[a-z0-9_]+)?(?:\s|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if a command requires admin access
 */
export function requiresAdminAccess(text: string | null | undefined): boolean {
  const name = commandName(text);
  if (name != null && ADMIN_COMMANDS.has(name)) return true;
  // Thai command aliases that require admin
  return /^\/(?:\u0e22\u0e2d\u0e14|\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08|\u0e40\u0e23\u0e15|\u0e2b\u0e49\u0e2d\u0e07)(?:\s|$)/u.test((text ?? '').trim());
}

/**
 * Parse the limit argument from /recent_slips command
 * @param text - Full command text
 * @param fallback - Default limit (default: 5)
 * @returns Parsed limit (1-20) or null if invalid
 */
export function parseRecentLimit(text: string, fallback = 5): number | null {
  const rest = text.replace(/^\/recent_slips(?:@[a-z0-9_]+)?/i, '').trim();
  if (!rest) return fallback;
  if (!/^\d+$/.test(rest)) return null;
  const value = Number(rest);
  return Number.isSafeInteger(value) && value >= 1 && value <= 20 ? value : null;
}

export interface SaveSlipArgs {
  thb: number | null;
  usdt: number | null;
  bank: string | null;
  last4: string | null;
}

/**
 * Parse arguments from /save_slip command
 * Examples:
 * - "/save_slip" -> { thb: null, usdt: null, bank: null, last4: null }
 * - "/save_slip +500B" -> { thb: 500, usdt: null, bank: null, last4: null }
 * - "/save_slip +500B KBANK 7890" -> { thb: 500, usdt: null, bank: "KBANK", last4: "7890" }
 * - "/save_slip -100U" -> { thb: null, usdt: 100, bank: null, last4: null }
 */
export function parseSaveSlipArgs(text: string): SaveSlipArgs | null {
  const rest = text.replace(/^\/save_slip(?:@[a-z0-9_]+)?/i, '').trim();
  if (!rest) return { thb: null, usdt: null, bank: null, last4: null };
  
  // Match: +500B [KBANK 7890]
  const thbMatch = rest.match(/^\+\s*(\d[\d,]*(?:\.\d+)?)\s*(?:B|THB|\u0e1a\u0e32\u0e17|\u0e1a)(?:\s+([A-Za-z0-9]+)\s+(\d{4}))?$/iu);
  if (thbMatch) {
    const thb = Number(thbMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(thb) || thb <= 0) return null;
    return {
      thb,
      usdt: null,
      bank: thbMatch[2] ? normalizeBankCode(thbMatch[2]) : null,
      last4: thbMatch[3] ?? null,
    };
  }
  
  // Match: -100U
  const usdtMatch = rest.match(/^\-\s*(\d[\d,]*(?:\.\d+)?)\s*(?:U|USDT)/i);
  if (usdtMatch) {
    const usdt = Number(usdtMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(usdt) || usdt <= 0) return null;
    return {
      thb: null,
      usdt,
      bank: null,
      last4: null,
    };
  }
  
  return null;
}

/**
 * Get configured admin IDs from environment variable
 */
export function configuredAdminIds(envValue = process.env.ADMIN_TELEGRAM_IDS): Set<number> {
  return new Set(
    (envValue ?? '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0),
  );
}

/**
 * Check if user is a bootstrap admin (configured in ADMIN_TELEGRAM_IDS)
 */
export function isBootstrapAdmin(userId: number, envValue = process.env.ADMIN_TELEGRAM_IDS): boolean {
  return configuredAdminIds(envValue).has(userId);
}

/**
 * Escape HTML special characters for Telegram messages
 */
export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Create a Telegram user mention link
 */
export function telegramUserMention(userId: number, name: string): string {
  return `<a href="tg://user?id=${userId}">${escapeTelegramHtml(name || 'Admin')}</a>`;
}

/**
 * Generate a unique fingerprint for a slip file
 */
export function slipFingerprint(fileUniqueId: string): string {
  if (!fileUniqueId.trim()) throw new Error('MISSING_FILE_UNIQUE_ID');
  return createHash('sha256').update(`telegram:${fileUniqueId}`).digest('hex');
}

/**
 * Check if confidence score is below threshold
 * @param value - Confidence score (0-100)
 * @param threshold - Threshold (default: 90)
 */
export function isLowConfidence(value: number | null | undefined, threshold = 90): boolean {
  return value == null || !Number.isFinite(value) || value < threshold;
}

/**
 * Normalize bank code to standard format
 */
export function normalizeBankCode(value: string | null | undefined): string | null {
  const compact = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return null;
  const aliases: Record<string, string> = {
    KASIKORN: 'KBANK', KASIKORNBANK: 'KBANK', KBANK: 'KBANK',
    SIAMCOMMERCIALBANK: 'SCB', SCB: 'SCB',
    KRUNGTHAI: 'KTB', KTB: 'KTB',
    BANGKOKBANK: 'BBL', BBL: 'BBL',
    KRUNGSRI: 'BAY', BAY: 'BAY',
    TTB: 'TTB', CIMB: 'CIMB', GSB: 'GSB', BAAC: 'BAAC', TMN: 'TMN',
  };
  return aliases[compact] ?? compact.slice(0, 32);
}
