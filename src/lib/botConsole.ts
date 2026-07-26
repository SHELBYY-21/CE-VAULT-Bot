/**
 * CE VAULT — FinTech Operations Console (Telegram HTML)
 *
 * Visual language: Bloomberg × Stripe × Linear × Apple Wallet
 * Telegram can't paint OLED backgrounds — hierarchy is typography,
 * monospace metrics, status rails, and one card per message.
 */

import type { OutgoingMessage } from './telegram';

export const APP_RAW = (process.env.APP_URL || '').replace(/\/$/, '');
export const APP =
  APP_RAW.startsWith('https://') && !APP_RAW.includes('localhost') ? APP_RAW : '';
export const FEE_WARN = Number(process.env.FEE_WARNING_THRESHOLD || 3);

/** Hairline rule (card section break) */
export const RULE = '────────────────';

/** Design reference (CSS / brand kit — not renderable in Telegram) */
export const PALETTE = {
  primary: '#05050A',
  surface: '#101114',
  border: 'rgba(255,255,255,.06)',
  gold: '#E5C04A',
  cyan: '#00F0FF',
  success: '#00D26A',
  warning: '#FFB800',
  danger: '#FF4D4F',
} as const;

export type PipelineStatus =
  | 'RECEIVED'
  | 'OCR_VERIFIED'
  | 'WAITING_USDT'
  | 'SETTLED'
  | 'REVIEW'
  | 'ERROR';

const PIPELINE: Array<{ id: PipelineStatus; label: string }> = [
  { id: 'RECEIVED', label: 'RECEIVED' },
  { id: 'OCR_VERIFIED', label: 'OCR VERIFIED' },
  { id: 'WAITING_USDT', label: 'WAITING USDT' },
  { id: 'SETTLED', label: 'SETTLED' },
];

const nf2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nf4 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Escape user-controlled strings before HTML interpolate */
export function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function money(n: number, digits: 2 | 4 = 2): string {
  const v = Number(n) || 0;
  return digits === 4 ? nf4.format(v) : nf2.format(v);
}

export function pct(n: number): string {
  const v = Number(n) || 0;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export function fmtUsdt(n: number): string {
  return money(n, 4);
}

/**
 * Status rail — only the active step glows (bold ●).
 * Past = ○, future = muted ○.
 */
export function statusRail(active: PipelineStatus): string {
  if (active === 'ERROR') {
    return `<b>● ERROR</b>`;
  }
  if (active === 'REVIEW') {
    return (
      PIPELINE.map((s) => `<i>○ ${s.label}</i>`).join('\n') + `\n<b>● REVIEW</b>`
    );
  }
  const activeIdx = PIPELINE.findIndex((s) => s.id === active);
  return PIPELINE.map((s, i) => {
    if (i === activeIdx) return `<b>● ${s.label}</b>`;
    if (i < activeIdx) return `○ ${s.label}`;
    return `<i>○ ${s.label}</i>`;
  }).join('\n');
}

export type Metric = { label: string; value: string };

/** Label above monospace value — one metric per block */
export function metrics(rows: Metric[]): string {
  return rows
    .map((r) => `${esc(r.label)}\n<code>${esc(r.value)}</code>`)
    .join('\n\n');
}

/** Compact 2-col monospace rows (labels + numeric values only) */
export function monoRows(rows: [string, string][]): string {
  const lines = rows.map(([k, v]) => `${k.padEnd(12)}${v}`);
  return `<pre>${lines.map((l) => esc(l)).join('\n')}</pre>`;
}

export type CardOpts = {
  /** Small card kind tag under brand */
  kind?: string;
  subtitle?: string;
  ledgerId?: string;
  status?: PipelineStatus;
  /** Main body (already HTML-safe or built via helpers) */
  body: string;
  /** Optional footer note (italic) */
  note?: string;
  reply_markup?: unknown;
};

/**
 * One message = one card.
 * Header → status (optional) → body → note
 */
export function card(opts: CardOpts): OutgoingMessage {
  const parts: string[] = [];
  parts.push(`<b>CE VAULT</b>`);
  parts.push(`<i>${esc(opts.subtitle ?? 'Secure Ledger')}</i>`);
  if (opts.kind) parts.push(`<code>${esc(opts.kind)}</code>`);
  if (opts.ledgerId) parts.push(`Ledger  <code>#${esc(opts.ledgerId)}</code>`);
  parts.push(RULE);
  if (opts.status) {
    parts.push(statusRail(opts.status));
    parts.push(RULE);
  }
  parts.push(opts.body.trim());
  if (opts.note) {
    parts.push(RULE);
    parts.push(`<i>${opts.note}</i>`);
  }
  return {
    text: parts.join('\n'),
    reply_markup: opts.reply_markup,
  };
}

export function actionButtons(transactionId?: string): unknown {
  const rows: Array<Array<Record<string, string>>> = [];
  if (transactionId) {
    rows.push([
      { text: 'Edit', callback_data: `edit:${transactionId}` },
      { text: 'Delete', callback_data: `del:${transactionId}` },
    ]);
  }
  if (APP) {
    if (transactionId) {
      rows.push([
        {
          text: 'Open detail',
          url: `${APP}/dashboard/transactions/${transactionId}`,
        },
      ]);
    }
    rows.push([{ text: 'Dashboard', url: `${APP}/dashboard` }]);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export function confirmKeyboard(ledgerRef: string): unknown {
  return {
    inline_keyboard: [
      [
        { text: 'Confirm', callback_data: `dealok:${ledgerRef}` },
        { text: 'Edit', callback_data: 'dealedit:1' },
        { text: 'Cancel', callback_data: 'cancelop:1' },
      ],
    ],
  };
}

export const FORMAT_HINT =
  `<code>+500B</code>   THB in\n` +
  `<code>-13.6U</code>  USDT out\n` +
  `<i>Combined:</i>  <code>+500B -13.6U</code>`;
