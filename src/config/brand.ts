// ============================================================
// CE VAULT — Brand kit tokens (source of truth for bot + web)
// Mirror: brandkit-test.html · Brand Cards Kit v1.0
// Telegram HTML ใช้ MARK/NAME/SIG — สี CSS ใช้ใน web เท่านั้น
// ============================================================

/** Wordmark — always uppercase in product surfaces */
export const BRAND_NAME = 'CE VAULT';

/** Hex mark used in Telegram HTML + status footer */
export const BRAND_MARK = '⬢';

/** Kit signature (success / ledger footers) */
export const BRAND_TAGLINE = 'FAST · SECURE · TRUSTED · 24/7';

/** Short product line (welcome / help) */
export const BRAND_PRODUCT = 'secure USDT ledger';

/** NOVA palette — same as brandkit-test.html / globals.css */
export const BRAND_COLORS = {
  bg: '#0a0d12',
  green: '#00e676',
  cyan: '#00d8ff',
  gold: '#f5c842',
  red: '#ff5a6e',
  text: '#e8f4f8',
} as const;

/** Telegram HTML: brand header chip */
export const BRAND_HTML = `${BRAND_MARK} <b>${BRAND_NAME}</b>`;

/** Telegram HTML: footer signature */
export const BRAND_SIG = `<i>${BRAND_MARK} ${BRAND_NAME} · ${BRAND_TAGLINE}</i>`;
