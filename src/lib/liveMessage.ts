/**
 * Live Message — one Telegram message per deal, always editMessage()
 *
 * Receiving → OCR → Match → Recorded → Waiting → Done
 * Chat stays clean: send once, then edit in place.
 * RECORDED ≠ SETTLED: recording an incoming THB transaction never closes the deal.
 */
import { editMessage, sendMessage, type OutgoingMessage } from './telegram';
import { formatVolumeThb, type ReceiverIntel } from './receiverIntel';
import { ceMessage, ceRecorded, ceOcrAmount, CE_DIVIDER } from './ceReplyTheme';
import { motionAfter, motionGate } from './motionFx';

export type LiveStage =
  | 'RECEIVING'
  | 'OCR'
  | 'MATCH'
  | 'RECORDED'
  | 'WAITING'
  | 'SETTLED'
  | 'ERROR';

const STAGES: Array<{ id: Exclude<LiveStage, 'ERROR'>; label: string }> = [
  { id: 'RECEIVING', label: 'Receiving' },
  { id: 'OCR', label: 'OCR' },
  { id: 'MATCH', label: 'Match' },
  { id: 'RECORDED', label: 'Recorded' },
  { id: 'WAITING', label: 'Waiting' },
  { id: 'SETTLED', label: 'Done' },
];

const RULE = CE_DIVIDER;

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
    `<b>◈ CE VAULT</b>`,
    `<i>Live Message</i>`,
    RULE,
    liveRail(opts.stage),
  ];
  if (opts.ledgerRef) {
    parts.push(RULE, `เลขอ้างอิง (Reference / 交易编号)  <code>#${esc(opts.ledgerRef)}</code>`);
  }
  if (opts.body) {
    parts.push(RULE, opts.body);
  }
  const text = parts.join('\n');
  return {
    text,
    fallback_text: text,
    rich_message: { html: text },
    reply_markup: opts.reply_markup,
  };
}

export function liveReceiving(ledgerRef?: string | null): OutgoingMessage {
  return liveCard({
    stage: 'RECEIVING', ledgerRef,
    body: '<i>📷 กำลังรับสลิป (Receiving slip / 正在接收凭证)...</i>',
  });
}

/** MSG-01 — preserve single-message edit lifecycle during OCR. */
export function liveOcr(ledgerRef?: string | null): OutgoingMessage {
  const text =
    ceMessage('MSG-01', '🔄 กำลังอ่านสลิป (Scanning slip / 正在识别凭证)...\n⏳ OCR กำลังประมวลผล') +
    (ledgerRef ? '\n' + RULE + '\n🆔 <code>#' + esc(ledgerRef) + '</code>' : '');
  return { text, fallback_text: text, rich_message: { html: text } };
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
  lines.push(ceOcrAmount(d.thb, d.confidence));
  if (d.receiverName) lines.push(`ผู้รับ (Recipient / 收款人)  <code>${esc(d.receiverName)}</code>`);
  if (d.bank || d.last4)
    lines.push(
      `ธนาคาร (Bank / 银行)  <code>${esc(d.bank ?? '-')}${d.last4 ? ` ••••${esc(d.last4)}` : ''}</code>`,
    );

  return liveCard({
    stage: 'MATCH',
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
  intel?: ReceiverIntel | null;
}): OutgoingMessage {
  const lines: string[] = [];
  if (d.intel) {
    lines.push(intelBlock(d.intel), '');
  }
  lines.push(ceOcrAmount(d.thb, d.confidence));
  if (!d.intel && (d.bank || d.last4))
    lines.push(
      `Bank    <code>${esc(d.bank ?? '-')}${d.last4 ? ` ••••${esc(d.last4)}` : ''}</code>`,
    );

  lines.push('');
  lines.push(d.hint || `<i>Waiting USDT proof or</i> <code>-13.6U</code>`);
  return liveCard({
    stage: 'WAITING',
    ledgerRef: d.ledgerRef,
    body: lines.join('\n'),
  });
}

export function liveRecorded(d: {
  ledgerRef: string;
  thb?: number | null;
  usdt?: number | null;
  sellRate?: number | null;
  adminName?: string | null;
  bank?: string | null;
  accountNumber?: string | null;
  last4?: string | null;
  transactionId?: string | null;
}): OutgoingMessage {
  const account = d.accountNumber
    ? d.accountNumber
    : d.last4
      ? `••••${d.last4}`
      : null;
  const lines = [
    '<b>◈ CE · RECORDED (已记录) ✓</b>',
    '<b>🟡 NEXT: WAITING USDT</b>',
    d.thb != null ? `📥 ${liveMoney(d.thb)} THB` : null,
    d.usdt != null ? `💎 ${Number(d.usdt).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDT` : null,
    d.sellRate != null ? `💱 RATE ${liveMoney(d.sellRate)}` : null,
    d.bank || account ? `🏦 ${esc(d.bank ?? '—')}${account ? ` · ${esc(account)}` : ''}` : null,
    d.adminName ? `👤 ${esc(d.adminName)}` : null,
    '<i>Settlement not verified / 尚未结算确认</i>',
  ].filter(Boolean).join('\n');

  return liveCard({
    stage: 'RECORDED',
    ledgerRef: d.ledgerRef,
    body: lines,
    reply_markup: d.transactionId
      ? { inline_keyboard: [[
          { text: '✏️ EDIT', callback_data: `edit:${d.transactionId}` },
          { text: '🗑 DELETE', callback_data: `del:${d.transactionId}` },
        ]] }
      : undefined,
  });
}

export function liveSettled(d: {
  ledgerRef: string;
  usdt?: number | null;
  adminName?: string | null;
  transactionId?: string | null;
}): OutgoingMessage {
  const amount = d.usdt == null ? '—' : Number(d.usdt).toLocaleString('en-US', { maximumFractionDigits: 6 });
  const text =
    `<b>◈ CE · DONE ✓</b>\n` +
    `💎 SETTLED · ${esc(amount)} USDT\n` +
    `${RULE}\n` +
    `OCR ✓ · MATCH ✓ · IN ✓ · WAIT ✓ · DONE ✓\n` +
    `🆔 <code>#${esc(d.ledgerRef)}</code>` +
    (d.adminName ? `\n👤 ${esc(d.adminName)}` : '');
  return {
    text,
    fallback_text: text,
    rich_message: { html: text },
    reply_markup: d.transactionId
      ? { inline_keyboard: [[
          { text: '✏️ EDIT', callback_data: `edit:${d.transactionId}` },
          { text: '🗑 DELETE', callback_data: `del:${d.transactionId}` },
        ]] }
      : undefined,
  };
}

export function liveError(_message: string, ledgerRef?: string | null): OutgoingMessage {
  // Never claim "nothing was saved": a timeout may happen after a DB commit.
  const text = ceMessage(
    'MSG-29',
    '⚠️ ระบบขัดข้อง (Processing error / 处理异常)\n\nไม่สามารถดำเนินการได้\nตรวจสอบ Ledger ก่อนลองใหม่อีกครั้ง (Check transaction status before retrying)' +
      (ledgerRef ? '\n🆔 <code>#' + esc(ledgerRef) + '</code>' : ''),
  );
  return { text, fallback_text: text, rich_message: { html: text } };
}

/** Compact intel block for Live Message body */
export function intelBlock(intel: ReceiverIntel): string {
  const bankLine = intel.bank
    ? `${esc(intel.bank)} •${esc(intel.last4)}`
    : `••••${esc(intel.last4)}`;
  return (
    `<b>Receiver Intelligence</b>\n` +
    `Receiver       <code>${bankLine}</code>\n` +
    `Transactions   <code>${intel.transactions}</code>\n` +
    `Volume         <code>${formatVolumeThb(intel.volumeThb)}</code>\n` +
    `Last           <code>${esc(intel.lastRelative)}</code>\n` +
    `Risk           <code>${intel.risk}</code>\n` +
    `Duplicate      <code>${intel.duplicate ? 'Yes' : 'No'}</code>`
  );
}

/** Standalone Assistant card — type 3376 → instant */
export function receiverIntelCard(intel: ReceiverIntel): OutgoingMessage {
  const bank = intel.bank ?? '—';
  return {
    text:
      `<b>CE VAULT</b>\n` +
      `<i>Receiver Intelligence</i>\n` +
      `${RULE}\n` +
      `Receiver\n<code>${esc(bank)}</code>\n<code>${esc(intel.last4)}</code>\n\n` +
      `History\n<code>${intel.transactions}</code>\n\n` +
      `Volume\n<code>${formatVolumeThb(intel.volumeThb)}</code>\n\n` +
      `Risk\n<code>${intel.risk}</code>\n` +
      (intel.known
        ? `${RULE}\n<i>Known account — slip will load this profile instantly</i>`
        : `${RULE}\n<i>New receiver — no history yet</i>`),
  };
}

/** Live Message stage with Receiver Intelligence (on slip) */
export function liveIntelVerified(d: {
  ledgerRef?: string | null;
  thb?: number | null;
  confidence?: number | null;
  intel: ReceiverIntel;
  skippedOcr?: boolean;
}): OutgoingMessage {
  const lines: string[] = [intelBlock(d.intel)];
  lines.push('', ceOcrAmount(d.thb, d.confidence));

  if (d.skippedOcr) lines.push('', `<i>Known account — profile loaded (OCR light)</i>`);
  return liveCard({
    stage: d.intel.known ? 'MATCH' : 'OCR',
    ledgerRef: d.ledgerRef,
    body: lines.join('\n'),
  });
}

/**
 * Upsert Live Message:
 * - first call (no id) → sendMessage once
 * - every later call → editMessage only
 * - motion layer (mascot sticker + OCR effect) fires per stage — src/lib/motionFx.ts
 */
export async function upsertLive(
  chatId: number,
  messageId: number | null | undefined,
  message: OutgoingMessage,
): Promise<number> {
  // Motion layer: gate before the edit (stops stale OCR effects), fire after.
  motionGate(messageId, message);
  if (messageId) {
    const ok = await editMessage(chatId, messageId, message);
    if (ok) {
      motionAfter(chatId, messageId, message);
      return messageId;
    }
  }
  const id = await sendMessage(chatId, message);
  motionAfter(chatId, id, message);
  return id;
}
