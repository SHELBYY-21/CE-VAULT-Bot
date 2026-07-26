/**
 * Live Message — one Telegram message per deal, always editMessage()
 *
 * Receiving... → OCR → Verified → Waiting → Settled
 * Chat stays clean: send once, then edit in place.
 */
import { editMessage, sendMessage, type OutgoingMessage } from './telegram';

export type LiveStage = 'RECEIVING' | 'OCR' | 'VERIFIED' | 'WAITING' | 'SETTLED' | 'ERROR';

const STAGES: Array<{ id: Exclude<LiveStage, 'ERROR'>; label: string }> = [
  { id: 'RECEIVING', label: 'Receiving...' },
  { id: 'OCR', label: 'OCR' },
  { id: 'VERIFIED', label: 'Verified' },
  { id: 'WAITING', label: 'Waiting' },
  { id: 'SETTLED', label: 'Settled' },
];

const RULE = '────────────────';

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const nf = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function liveMoney(n: number): string {
  return nf.format(Number(n) || 0);
}

/** Vertical status rail — active step bold ●, past ✓, future ○ */
export function liveRail(active: LiveStage): string {
  if (active === 'ERROR') return `<b>● Error</b>`;
  const idx = STAGES.findIndex((s) => s.id === active);
  return STAGES.map((s, i) => {
    if (i === idx) return `<b>● ${s.label}</b>`;
    if (i < idx) return `✓ ${s.label}`;
    return `<i>○ ${s.label}</i>`;
  }).join('\n');
}

export type LiveCardOpts = {
  stage: LiveStage;
  ledgerRef?: string | null;
  body?: string;
  reply_markup?: unknown;
};

/** Single Live Message shell */
export function liveCard(opts: LiveCardOpts): OutgoingMessage {
  const parts = [
    `<b>CE VAULT</b>`,
    `<i>Live Message</i>`,
    RULE,
    liveRail(opts.stage),
  ];
  if (opts.ledgerRef) {
    parts.push(RULE, `Ledger  <code>#${esc(opts.ledgerRef)}</code>`);
  }
  if (opts.body) {
    parts.push(RULE, opts.body);
  }
  return { text: parts.join('\n'), reply_markup: opts.reply_markup };
}

export function liveReceiving(ledgerRef?: string | null): OutgoingMessage {
  return liveCard({
    stage: 'RECEIVING',
    ledgerRef,
    body: `<i>Receiving slip…</i>`,
  });
}

export function liveOcr(ledgerRef?: string | null): OutgoingMessage {
  return liveCard({
    stage: 'OCR',
    ledgerRef,
    body: `<i>Reading slip (OCR)…</i>`,
  });
}

export function liveVerified(d: {
  ledgerRef?: string | null;
  thb?: number | null;
  bank?: string | null;
  last4?: string | null;
  confidence?: number | null;
  receiverName?: string | null;
}): OutgoingMessage {
  const lines: string[] = [];
  if (d.thb != null) lines.push(`THB     <code>${liveMoney(d.thb)}</code>`);
  if (d.receiverName) lines.push(`Payee   <code>${esc(d.receiverName)}</code>`);
  if (d.bank || d.last4)
    lines.push(
      `Bank    <code>${esc(d.bank ?? '-')}${d.last4 ? ` ••••${esc(d.last4)}` : ''}</code>`,
    );
  if (d.confidence != null) lines.push(`OCR     <code>${d.confidence.toFixed(0)}%</code>`);
  return liveCard({
    stage: 'VERIFIED',
    ledgerRef: d.ledgerRef,
    body: lines.join('\n') || `<i>Slip verified</i>`,
  });
}

export function liveWaiting(d: {
  ledgerRef: string;
  thb?: number | null;
  bank?: string | null;
  last4?: string | null;
  confidence?: number | null;
  hint?: string | null;
}): OutgoingMessage {
  const lines: string[] = [];
  if (d.thb != null) lines.push(`THB     <code>${liveMoney(d.thb)}</code>`);
  if (d.bank || d.last4)
    lines.push(
      `Bank    <code>${esc(d.bank ?? '-')}${d.last4 ? ` ••••${esc(d.last4)}` : ''}</code>`,
    );
  if (d.confidence != null) lines.push(`OCR     <code>${d.confidence.toFixed(0)}%</code>`);
  lines.push('');
  lines.push(d.hint || `<i>Waiting USDT proof or</i> <code>-13.6U</code>`);
  return liveCard({
    stage: 'WAITING',
    ledgerRef: d.ledgerRef,
    body: lines.join('\n'),
  });
}

export function liveSettled(d: {
  ledgerRef: string;
  thb?: number | null;
  usdt?: number | null;
  sellRate?: number | null;
  adminName?: string | null;
  bank?: string | null;
  last4?: string | null;
  transactionId?: string | null;
}): OutgoingMessage {
  const lines: string[] = [];
  if (d.thb != null) lines.push(`THB     <code>${liveMoney(d.thb)}</code>`);
  if (d.usdt != null) lines.push(`USDT    <code>${liveMoney(d.usdt)}</code>`);
  if (d.sellRate != null) lines.push(`Sell    <code>${liveMoney(d.sellRate)}</code>`);
  if (d.bank || d.last4)
    lines.push(
      `Bank    <code>${esc(d.bank ?? '-')}${d.last4 ? ` ••••${esc(d.last4)}` : ''}</code>`,
    );
  if (d.adminName) lines.push(`Staff   <code>${esc(d.adminName)}</code>`);
  return liveCard({
    stage: 'SETTLED',
    ledgerRef: d.ledgerRef,
    body: lines.join('\n'),
    reply_markup: d.transactionId
      ? {
          inline_keyboard: [
            [
              { text: 'Edit', callback_data: `edit:${d.transactionId}` },
              { text: 'Delete', callback_data: `del:${d.transactionId}` },
            ],
          ],
        }
      : undefined,
  });
}

export function liveError(message: string, ledgerRef?: string | null): OutgoingMessage {
  return liveCard({
    stage: 'ERROR',
    ledgerRef,
    body: `<code>${esc(message)}</code>`,
  });
}

/**
 * Upsert Live Message:
 * - first call (no id) → sendMessage once
 * - every later call → editMessage only
 */
export async function upsertLive(
  chatId: number,
  messageId: number | null | undefined,
  message: OutgoingMessage,
): Promise<number> {
  if (messageId) {
    const ok = await editMessage(chatId, messageId, message);
    if (ok) return messageId;
  }
  return sendMessage(chatId, message);
}
