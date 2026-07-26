// ============================================================
// CE VAULT — FinTech Operations Console (Telegram)
// One message = one card. Typography first. Monospace numbers.
// ============================================================
import { randomBytes } from 'crypto';
import type { OutgoingMessage } from './telegram';
import {
  APP,
  FEE_WARN,
  FORMAT_HINT,
  RULE,
  actionButtons,
  card,
  confirmKeyboard,
  esc,
  fmtUsdt,
  metrics,
  money,
  monoRows,
  pct,
  type PipelineStatus,
} from './botConsole';

export { FORMAT_HINT, money, pct, statusRail } from './botConsole';

export function refCode(txId: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = (txId || '').replace(/-/g, '').slice(0, 4).toUpperCase() || '----';
  return `CE-${ymd}-${tail}`;
}

export function newLedgerRef(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `CE-${ymd}-${rand}`;
}

function receiverLine(
  bank?: string | null,
  last4?: string | null,
  name?: string | null,
): string | null {
  if (!bank && !last4 && !name) return null;
  const acct = last4 ? `${bank ?? 'BANK'} ••••${last4}` : (bank ?? '-');
  return name ? `${name} · ${acct}` : acct;
}

// ═══════════════ Onboarding ═══════════════
export function welcomeRegistered(name: string): OutgoingMessage {
  return card({
    kind: 'CONSOLE',
    subtitle: 'Secure Ledger',
    body:
      `Operator\n<code>${esc(name)}</code>\n\n` +
      `<b>1 · Receive</b>\n` +
      `<i>Send THB slip · system reads amount</i>\n\n` +
      `<b>2 · Settle</b>\n` +
      `<i>Send USDT proof or type</i> <code>-13.6U</code>\n\n` +
      `<b>3 · Rates</b>\n` +
      `<code>/rate</code>  view ·  <code>/rate 35.5</code>  set sell`,
    reply_markup: actionButtons(),
  });
}

export function askName(): OutgoingMessage {
  return card({
    kind: 'ACCESS',
    subtitle: 'Secure Ledger',
    body:
      `Admin identity required\n\n` +
      `Type <code>/admin</code> followed by your name\n\n` +
      `<code>/admin Operator A</code>`,
    note: 'Name alone will not register',
  });
}

export function adminUsage(): OutgoingMessage {
  return card({
    kind: 'ACCESS',
    body:
      `Set admin name\n\n` +
      `<code>/admin Operator A</code>\n` +
      `<code>/admin RAZEN</code>`,
  });
}

export function askNameAgain(): OutgoingMessage {
  return card({
    kind: 'ACCESS',
    status: 'ERROR',
    body:
      `Command required\n\n` +
      `Use <code>/admin</code> + name\n` +
      `<code>/admin Operator A</code>`,
  });
}

export function nameRejected(raw: string): OutgoingMessage {
  return card({
    kind: 'ACCESS',
    status: 'ERROR',
    body:
      `Invalid name\n<code>${esc(raw.slice(0, 40))}</code>\n\n` +
      `Use a display name, not an amount\n` +
      `<code>/admin RAZEN</code>`,
  });
}

export function registered(name: string): OutgoingMessage {
  return card({
    kind: 'ACCESS',
    subtitle: 'Secure Ledger',
    status: 'SETTLED',
    body:
      `Registered\n<code>${esc(name)}</code>\n\n` +
      `Send a THB slip to open a ledger entry`,
    reply_markup: actionButtons(),
  });
}

// ═══════════════ OCR / upload ═══════════════
export function uploading(step = 0): OutgoingMessage {
  const labels = ['UPLOAD', 'PROCESS', 'PERSIST', 'READY'];
  const i = Math.min(step, 3);
  return card({
    kind: 'OCR',
    status: 'RECEIVED',
    body: `Processing\n<code>${labels[i]}</code>`,
  });
}

export interface SlipReadyData {
  type: 'THB_DEPOSIT' | 'USDT_SEND';
  thb?: number | null;
  date?: string | null;
  time?: string | null;
  last4?: string | null;
  bank?: string | null;
  receiverName?: string | null;
  confidence?: number | null;
  chatRate?: number | null;
  historyLine?: string | null;
}

export function slipReady(d: SlipReadyData): OutgoingMessage {
  if (d.type === 'USDT_SEND') {
    return card({
      kind: 'OCR',
      status: 'WAITING_USDT',
      body: `USDT transfer detected\n\nEnter amount\n<code>-13.6U</code>`,
    });
  }

  const gotAmount = d.thb != null && d.thb > 0;
  const lowConf = d.confidence != null && d.confidence < 90;
  const status: PipelineStatus = !gotAmount || lowConf ? 'RECEIVED' : 'OCR_VERIFIED';

  const rows: { label: string; value: string }[] = [];
  if (gotAmount) rows.push({ label: 'THB', value: money(d.thb!) });
  if (d.confidence != null)
    rows.push({ label: 'Confidence', value: `${d.confidence.toFixed(1)}%` });
  const recv = receiverLine(d.bank, d.last4, d.receiverName);
  if (recv) rows.push({ label: 'Receiver', value: recv });
  if (d.date || d.time)
    rows.push({ label: 'Timestamp', value: [d.date, d.time].filter(Boolean).join(' ') });

  const canAuto = !!(d.chatRate && gotAmount);
  const usdtAuto = canAuto ? d.thb! / d.chatRate! : 0;

  let ask: string;
  if (!gotAmount) {
    ask = `Amount unread\nType <code>500 36.65</code>`;
  } else if (canAuto) {
    ask =
      metrics([
        { label: 'Should Send USDT', value: fmtUsdt(usdtAuto) },
        { label: 'Sell Rate', value: money(d.chatRate!) },
      ]) + `\n\nConfirm below or type a new rate`;
  } else {
    ask = `Type USDT received\n<code>11</code>`;
  }

  const kb =
    canAuto && gotAmount
      ? {
          inline_keyboard: [
            [
              { text: 'Confirm', callback_data: `confirm:${usdtAuto.toFixed(2)}` },
              { text: 'Cancel', callback_data: 'cancelop:1' },
            ],
          ],
        }
      : undefined;

  return card({
    kind: 'OCR',
    status,
    body: (rows.length ? metrics(rows) + '\n\n' : '') + ask,
    note: lowConf ? 'Confidence below 90% — verify before settle' : undefined,
    reply_markup: kb,
  });
}

export function amountFormatHelp(): OutgoingMessage {
  return card({
    kind: 'INPUT',
    status: 'ERROR',
    body: `Currency required\n\n${FORMAT_HINT}`,
  });
}

export function wrongDirection(cur: 'THB' | 'USDT'): OutgoingMessage {
  const msg =
    cur === 'THB'
      ? `THB is inbound — use <code>+500B</code>`
      : `USDT is outbound — use <code>-13.6U</code>`;
  return card({ kind: 'INPUT', status: 'ERROR', body: `Direction invalid\n\n${msg}` });
}

export function thbSetWaitUsdt(thb: number): OutgoingMessage {
  return card({
    kind: 'RECEIVE',
    status: 'WAITING_USDT',
    body:
      metrics([{ label: 'THB', value: money(thb) }]) +
      `\n\nAwaiting USDT proof\n<code>-13.6U</code>`,
  });
}

export function needThb(): OutgoingMessage {
  return card({
    kind: 'OCR',
    status: 'ERROR',
    body: `THB unknown\n\nType both legs\n<code>+500B -13.6U</code>`,
  });
}

export function formatRecentBlock(
  recent?: { time: string; thb: number; usdt: number; gapMin: number | null }[] | null,
): string {
  if (!recent?.length) return '';
  const lines = recent.map((r) => {
    const gap = r.gapMin == null ? 'pending' : `${r.gapMin}m`;
    return `${r.time}  ${money(r.thb).padStart(10)}  ${fmtUsdt(r.usdt).padStart(10)}  ${gap}`;
  });
  return `${RULE}\nRecent\n<pre>${lines.map((l) => esc(l)).join('\n')}</pre>`;
}

/** RECEIVE card — THB inbound recorded */
export function incomingRecorded(d: {
  transactionId: string;
  ledgerRef: string;
  thb: number;
  usdtOwed: number;
  sellRate: number;
  adminName: string;
  bank?: string | null;
  last4?: string | null;
  confidence?: number | null;
  pinMatched?: boolean;
  time?: string | null;
  date?: string | null;
  recent?: { time: string; thb: number; usdt: number; gapMin: number | null }[] | null;
}): OutgoingMessage {
  const rows: { label: string; value: string }[] = [
    { label: 'THB', value: money(d.thb) },
    { label: 'Should Send USDT', value: fmtUsdt(d.usdtOwed) },
    { label: 'Sell Rate', value: money(d.sellRate) },
  ];
  const recv = receiverLine(d.bank, d.last4);
  if (recv) rows.push({ label: 'Receiver', value: recv });
  if (d.confidence != null)
    rows.push({ label: 'Confidence', value: `${d.confidence.toFixed(1)}%` });
  rows.push({ label: 'Operator', value: d.adminName });

  return card({
    kind: 'RECEIVE',
    ledgerId: d.ledgerRef,
    status: d.pinMatched ? 'OCR_VERIFIED' : 'WAITING_USDT',
    body: metrics(rows) + formatRecentBlock(d.recent),
    note: d.pinMatched ? 'Pinned account match' : 'Awaiting USDT settlement',
    reply_markup: actionButtons(d.transactionId),
  });
}

export function slipBankMismatch(d: {
  thb: number | null;
  bank?: string | null;
  last4?: string | null;
  pinBank?: string | null;
  pinLast4?: string | null;
  confidence?: number | null;
}): OutgoingMessage {
  const rows: { label: string; value: string }[] = [];
  if (d.thb != null) rows.push({ label: 'THB', value: money(d.thb) });
  rows.push({
    label: 'Slip',
    value: `${d.bank ?? '-'} ••••${d.last4 ?? '????'}`,
  });
  rows.push({
    label: 'Pinned',
    value: `${d.pinBank ?? '-'} ••••${d.pinLast4 ?? '????'}`,
  });
  if (d.confidence != null)
    rows.push({ label: 'Confidence', value: `${d.confidence.toFixed(1)}%` });

  const hint = d.thb != null ? money(d.thb).replace(/,/g, '') : '500';
  return card({
    kind: 'OCR',
    status: 'ERROR',
    body:
      metrics(rows) +
      `\n\nAccount mismatch\n` +
      `Manual record  <code>+${hint}</code>\n` +
      `Or pin  <code>/pin ${esc(d.bank ?? 'KBANK')} ${esc(d.last4 ?? '1234')}</code>`,
  });
}

export function slipAskPin(d: {
  thb: number;
  bank?: string | null;
  last4?: string | null;
  confidence?: number | null;
}): OutgoingMessage {
  const rows: { label: string; value: string }[] = [
    { label: 'THB', value: money(d.thb) },
  ];
  const recv = receiverLine(d.bank, d.last4);
  if (recv) rows.push({ label: 'Receiver', value: recv });
  if (d.confidence != null)
    rows.push({ label: 'Confidence', value: `${d.confidence.toFixed(1)}%` });

  return card({
    kind: 'OCR',
    status: 'OCR_VERIFIED',
    body:
      metrics(rows) +
      `\n\nNo receive account pinned today\n` +
      `<code>/pin ${esc(d.bank ?? 'kbank')} ${esc(d.last4 ?? '1234')}</code>\n` +
      `Or record  <code>+${money(d.thb).replace(/,/g, '')}</code>`,
    note: 'Aliases: scb · kbank · ktb · bbl · tmn',
  });
}

export function pinStatusCard(d: {
  today: string;
  banks: {
    label: string;
    bank_name: string;
    account_number: string | null;
    current_balance: number;
  }[];
  max?: number;
}): OutgoingMessage {
  const max = d.max ?? 3;
  if (!d.banks.length) {
    return card({
      kind: 'PIN',
      subtitle: d.today,
      body:
        `No receive accounts\n\n` +
        `<code>/pin kbank 1234567890</code>\n` +
        `Max <code>${max}</code> · match = OCR verified`,
      note: 'Aliases: scb · kbank · ktb · bbl · tmn',
    });
  }
  const block = d.banks
    .map((b, i) => {
      const last4 = (b.account_number || '').replace(/\D/g, '').slice(-4) || '????';
      return (
        `<b>${i + 1}</b>  ${esc(b.bank_name)}  <code>••••${last4}</code>\n` +
        `<i>${esc(b.label)}</i>  <code>${money(b.current_balance)}</code>`
      );
    })
    .join('\n\n');
  return card({
    kind: 'PIN',
    subtitle: `${d.today} · ${d.banks.length}/${max}`,
    body:
      block +
      `\n\n<code>/pin scb 9876543210</code>` +
      (d.banks.length >= max ? `  <i>full — /unpin first</i>` : '') +
      `\n<code>/unpin 1</code>`,
  });
}

export function pinSetOk(d: {
  today: string;
  bank_name: string;
  last4: string;
  label: string;
  count: number;
  max?: number;
}): OutgoingMessage {
  const max = d.max ?? 3;
  return card({
    kind: 'PIN',
    subtitle: `${d.today} · ${d.count}/${max}`,
    status: 'OCR_VERIFIED',
    body: metrics([
      { label: 'Bank', value: `${d.bank_name} ••••${d.last4}` },
      { label: 'Label', value: d.label },
    ]),
    note: 'Matching slips auto-verify',
  });
}

export function pinLimitCard(d: {
  today: string;
  banks: {
    bank_name: string;
    account_number: string | null;
    label: string;
  }[];
  max?: number;
}): OutgoingMessage {
  const max = d.max ?? 3;
  const lines = d.banks
    .map((b, i) => {
      const last4 = (b.account_number || '').replace(/\D/g, '').slice(-4) || '????';
      return `<b>${i + 1}</b>  ${esc(b.bank_name)}  <code>••••${last4}</code>`;
    })
    .join('\n');
  return card({
    kind: 'PIN',
    subtitle: d.today,
    status: 'ERROR',
    body: `Pin limit <code>${max}</code>\n\n${lines}\n\n<code>/unpin 1</code>`,
  });
}

/** SUCCESS / OUT card */
export function outgoingRecorded(d: {
  transactionId: string;
  ledgerRef: string;
  usdt: number;
  adminName: string;
  remainingUsdt: number;
  recent?: { time: string; thb: number; usdt: number; gapMin: number | null }[] | null;
}): OutgoingMessage {
  const done = d.remainingUsdt <= 0.009;
  return card({
    kind: 'SETTLE',
    ledgerId: d.ledgerRef,
    status: done ? 'SETTLED' : 'WAITING_USDT',
    body:
      metrics([
        { label: 'USDT Out', value: fmtUsdt(d.usdt) },
        {
          label: done ? 'Status' : 'Remaining USDT',
          value: done ? 'SETTLED' : fmtUsdt(d.remainingUsdt),
        },
        { label: 'Operator', value: d.adminName },
      ]) + formatRecentBlock(d.recent),
    reply_markup: actionButtons(d.transactionId),
  });
}

export function slipUnclear(guess?: number | null): OutgoingMessage {
  const g = guess ? money(guess).replace(/,/g, '') : '500';
  return card({
    kind: 'OCR',
    status: 'ERROR',
    body: `Amount unclear\n\nRecord manually\n<code>+${g}</code>`,
  });
}

// ═══════════════ Confirmation / deal ═══════════════
export interface WaitUsdtData {
  thb?: number | null;
  bank?: string | null;
  last4?: string | null;
  receiverName?: string | null;
  date?: string | null;
  time?: string | null;
  confidence?: number | null;
  ledgerRef: string;
  historyLine?: string | null;
  roomRate?: number | null;
  roomName?: string | null;
}

export function waitUsdt(d: WaitUsdtData): OutgoingMessage {
  const gotAmount = d.thb != null && d.thb > 0;
  const lowConf = d.confidence != null && d.confidence < 90;
  const status: PipelineStatus = !gotAmount ? 'RECEIVED' : lowConf ? 'RECEIVED' : 'WAITING_USDT';

  const rows: { label: string; value: string }[] = [];
  if (gotAmount) rows.push({ label: 'THB', value: money(d.thb!) });
  if (d.confidence != null)
    rows.push({ label: 'Confidence', value: `${d.confidence.toFixed(1)}%` });
  const recv = receiverLine(d.bank, d.last4, d.receiverName);
  if (recv) rows.push({ label: 'Receiver', value: recv });
  if (d.roomRate)
    rows.push({
      label: 'Sell Rate',
      value: d.roomName ? `${money(d.roomRate)} · ${d.roomName}` : money(d.roomRate),
    });
  if (d.date || d.time)
    rows.push({ label: 'Timestamp', value: [d.date, d.time].filter(Boolean).join(' ') });

  return card({
    kind: 'OCR',
    ledgerId: d.ledgerRef,
    status,
    body:
      (rows.length ? metrics(rows) + '\n\n' : '') +
      `Awaiting USDT\n` +
      `Send transfer proof or type:\n` +
      FORMAT_HINT +
      (d.historyLine ? `\n\n${d.historyLine}` : ''),
    note: lowConf ? 'Confidence below 90% — verify amount' : undefined,
  });
}

export interface DealConfirmData {
  ledgerRef: string;
  thb: number;
  usdt: number;
  buyRate: number;
  sellRate: number;
  profitThb: number;
  receiverName?: string | null;
  bank?: string | null;
  last4?: string | null;
  network?: string | null;
}

/** TRANSACTION / Confirmation card */
export function dealConfirm(d: DealConfirmData): OutgoingMessage {
  const profitPct = d.thb > 0 ? (d.profitThb / d.thb) * 100 : 0;
  const rows: { label: string; value: string }[] = [
    { label: 'THB', value: money(d.thb) },
    { label: 'USDT', value: fmtUsdt(d.usdt) },
    { label: 'Buy Rate', value: money(d.buyRate) },
    { label: 'Sell Rate', value: money(d.sellRate) },
    { label: 'Profit', value: `${pct(profitPct)}  (${money(d.profitThb)} THB)` },
  ];
  const recv = receiverLine(d.bank, d.last4, d.receiverName);
  if (recv) rows.push({ label: 'Receiver', value: recv });
  if (d.network) rows.push({ label: 'Network', value: d.network });

  return card({
    kind: 'CONFIRM',
    ledgerId: d.ledgerRef,
    status: 'REVIEW',
    body: metrics(rows),
    note: 'One decision — confirm, edit, or cancel',
    reply_markup: confirmKeyboard(d.ledgerRef),
  });
}

export interface DealSuccessData {
  transactionId: string;
  ledgerRef: string;
  adminName: string;
  thb: number;
  usdt: number;
  buyRate: number;
  sellRate: number;
  profitThb: number;
  receiverName?: string | null;
  bank?: string | null;
  last4?: string | null;
}

export function dealSuccess(d: DealSuccessData): OutgoingMessage {
  const profitPct = d.thb > 0 ? (d.profitThb / d.thb) * 100 : 0;
  const rows: { label: string; value: string }[] = [
    { label: 'THB', value: money(d.thb) },
    { label: 'USDT', value: fmtUsdt(d.usdt) },
    { label: 'Buy Rate', value: money(d.buyRate) },
    { label: 'Sell Rate', value: money(d.sellRate) },
    { label: 'Profit', value: `${pct(profitPct)}  (${money(d.profitThb)} THB)` },
  ];
  const recv = receiverLine(d.bank, d.last4, d.receiverName);
  if (recv) rows.push({ label: 'Receiver', value: recv });
  rows.push({ label: 'Operator', value: d.adminName });

  return card({
    kind: 'SUCCESS',
    ledgerId: d.ledgerRef,
    status: 'SETTLED',
    body: metrics(rows),
    reply_markup: actionButtons(d.transactionId),
  });
}

export interface BrandCardData {
  usdt: number;
  txid?: string | null;
  network?: string | null;
  ledgerRef: string;
  transactionId?: string | null;
}

export function brandCard(d: BrandCardData): OutgoingMessage {
  const t = new Date().toLocaleTimeString('en-GB', {
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
  const shortTxid = d.txid ? `${d.txid.slice(0, 6)}…${d.txid.slice(-6)}` : null;
  const rows: { label: string; value: string }[] = [
    { label: 'USDT', value: fmtUsdt(d.usdt) },
    { label: 'Network', value: d.network ?? 'TRC-20' },
    { label: 'Time', value: t },
  ];
  if (shortTxid) rows.push({ label: 'TXID', value: shortTxid });

  return card({
    kind: 'SUCCESS',
    ledgerId: d.ledgerRef,
    status: 'SETTLED',
    body: metrics(rows),
    note:
      APP && d.transactionId
        ? `<a href="${APP}/status/${d.transactionId}">Track order</a>`
        : undefined,
  });
}

export function usdtMismatch(ocrVal: number, manualVal: number): OutgoingMessage {
  return card({
    kind: 'ERROR',
    status: 'ERROR',
    body:
      `USDT mismatch — confirmation blocked\n\n` +
      metrics([
        { label: 'OCR', value: fmtUsdt(ocrVal) },
        { label: 'Entered', value: fmtUsdt(manualVal) },
        { label: 'Delta', value: fmtUsdt(Math.abs(ocrVal - manualVal)) },
      ]) +
      `\n\nResend proof or type the correct amount\n<code>/cancel</code>`,
  });
}

export function confirmDeposit(thb: number, usdt: number, rate: number): OutgoingMessage {
  return card({
    kind: 'CONFIRM',
    status: 'REVIEW',
    body: metrics([
      { label: 'THB', value: money(thb) },
      { label: 'USDT', value: fmtUsdt(usdt) },
      { label: 'Rate', value: money(rate) },
    ]),
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Confirm', callback_data: `confirm:${usdt.toFixed(2)}` },
          { text: 'Cancel', callback_data: 'cancelop:1' },
        ],
      ],
    },
  });
}

export function confirmSend(usdt: number, holding: number): OutgoingMessage {
  return card({
    kind: 'CONFIRM',
    status: 'REVIEW',
    body: metrics([
      { label: 'USDT Out', value: fmtUsdt(usdt) },
      { label: 'Remaining', value: fmtUsdt(holding - usdt) },
    ]),
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Confirm', callback_data: `confirmsend:${usdt.toFixed(2)}` },
          { text: 'Cancel', callback_data: 'cancelop:1' },
        ],
      ],
    },
  });
}

// ═══════════════ Rates ═══════════════
export function rateShow(
  sell: number,
  market: number,
  source?: 'binance_th' | 'manual' | 'default',
): OutgoingMessage {
  const src =
    source === 'binance_th' ? 'LIVE · Binance TH' : source === 'manual' ? 'MANUAL' : 'DEFAULT';
  const spread = sell - market;
  const spreadPct = market > 0 ? (spread / market) * 100 : 0;
  return card({
    kind: 'RATES',
    body:
      metrics([
        { label: 'Sell Rate', value: money(sell) },
        { label: 'Market', value: `${money(market)}  (${src})` },
        { label: 'Spread', value: `${money(spread)}  (${pct(spreadPct)})` },
      ]) + `\n\nSet sell  <code>/rate 35.5</code>`,
  });
}

export function rateSet(
  name: string | null | undefined,
  sell: number,
  market: number,
): OutgoingMessage {
  return card({
    kind: 'RATES',
    status: 'SETTLED',
    body: metrics([
      { label: 'Sell Rate', value: money(sell) },
      { label: 'Market', value: money(market) },
      { label: 'Operator', value: name || 'admin' },
    ]),
  });
}

export function chatRateSet(rate: number): OutgoingMessage {
  return card({
    kind: 'RATES',
    status: 'SETTLED',
    body:
      metrics([{ label: 'Room Sell Rate', value: money(rate) }]) +
      `\n\nApplied to slip auto-calc in this room`,
  });
}

// ═══════════════ Legacy success shapes ═══════════════
export interface ThbSuccessData {
  transactionId: string;
  adminName: string;
  thb: number;
  usdt: number;
  netProfitThb: number;
  profitPercent: number;
  feeUsdt: number;
  feePercent: number;
  holdingUsdt: number;
}

export function thbSuccess(d: ThbSuccessData): OutgoingMessage {
  const rate = d.usdt > 0 ? d.thb / d.usdt : 0;
  return card({
    kind: 'SUCCESS',
    ledgerId: refCode(d.transactionId),
    status: 'SETTLED',
    body: metrics([
      { label: 'THB', value: money(d.thb) },
      { label: 'USDT', value: fmtUsdt(d.usdt) },
      { label: 'Buy Rate', value: money(rate) },
      { label: 'Profit', value: `${pct(d.profitPercent)}  (${money(d.netProfitThb)} THB)` },
      {
        label: 'Fee',
        value: `${fmtUsdt(d.feeUsdt)}  (${pct(d.feePercent)})${d.feePercent > FEE_WARN ? '  HIGH' : ''}`,
      },
      { label: 'Holding USDT', value: fmtUsdt(d.holdingUsdt) },
      { label: 'Operator', value: d.adminName },
    ]),
    reply_markup: actionButtons(d.transactionId),
  });
}

export interface UsdtSendData {
  transactionId: string;
  adminName: string;
  usdt: number;
  holdingUsdt: number;
}

export function usdtSendSuccess(d: UsdtSendData): OutgoingMessage {
  return card({
    kind: 'SETTLE',
    ledgerId: refCode(d.transactionId),
    status: 'SETTLED',
    body: metrics([
      { label: 'USDT Out', value: fmtUsdt(d.usdt) },
      { label: 'Holding', value: fmtUsdt(d.holdingUsdt) },
      { label: 'Operator', value: d.adminName },
    ]),
    reply_markup: actionButtons(d.transactionId),
  });
}

// ═══════════════ Edit / Delete ═══════════════
export function editPrompt(_type?: 'THB_DEPOSIT' | 'USDT_SEND'): OutgoingMessage {
  return card({
    kind: 'EDIT',
    status: 'REVIEW',
    body: `Edit mode\n\n${FORMAT_HINT}\n\n<code>/cancel</code>  abort`,
    note: 'Send only the legs you want to change',
  });
}

export interface EditSuccessData {
  transactionId: string;
  adminName: string;
  type: 'THB_DEPOSIT' | 'USDT_SEND';
  thb?: number;
  usdt: number;
  netProfitThb?: number;
  profitPercent?: number;
  feeUsdt?: number;
  feePercent?: number;
  holdingUsdt: number;
}

export function editSuccess(d: EditSuccessData): OutgoingMessage {
  const isDep = d.type === 'THB_DEPOSIT';
  const rows: { label: string; value: string }[] = isDep
    ? [
        { label: 'THB', value: money(d.thb ?? 0) },
        { label: 'USDT', value: fmtUsdt(d.usdt) },
        {
          label: 'Profit',
          value: `${pct(d.profitPercent ?? 0)}  (${money(d.netProfitThb ?? 0)} THB)`,
        },
        { label: 'Fee', value: `${fmtUsdt(d.feeUsdt ?? 0)}  (${pct(d.feePercent ?? 0)})` },
      ]
    : [{ label: 'USDT Out', value: fmtUsdt(d.usdt) }];
  rows.push({ label: 'Holding USDT', value: fmtUsdt(d.holdingUsdt) });
  rows.push({ label: 'Operator', value: d.adminName });

  return card({
    kind: 'EDIT',
    ledgerId: refCode(d.transactionId),
    status: 'SETTLED',
    body: metrics(rows),
    reply_markup: actionButtons(d.transactionId),
  });
}

export function deleteSuccess(name: string, holding: number): OutgoingMessage {
  return card({
    kind: 'DELETE',
    status: 'SETTLED',
    body: metrics([
      { label: 'Operator', value: name },
      { label: 'Holding USDT', value: fmtUsdt(holding) },
    ]),
    note: 'Transaction removed from ledger',
  });
}

export function cancelled(): OutgoingMessage {
  return card({
    kind: 'CANCEL',
    body: `Operation cancelled`,
  });
}

// ═══════════════ History / ledger ═══════════════
export interface LedgerEntry {
  time: string;
  thb: number;
  usdt: number;
}
export interface LedgerData {
  incomingList: LedgerEntry[];
  outgoingList: { time: string; usdt: number }[];
  totalThb: number;
  totalIncomingUsdt: number;
  totalOutgoingUsdt: number;
  fixedRate: number | null;
  feePercent: number;
  netProfitThb: number;
  lastAdminName: string | null;
  roomName?: string | null;
  staff?: { name: string; count: number; profitThb: number }[];
  recent?: { time: string; thb: number; usdt: number; gapMin: number | null }[];
  nowLabel?: string | null;
  pinnedBanks?: { bank_name: string; last4: string; balance: number }[] | null;
  lastCustomer?: {
    name: string | null;
    bank: string | null;
    last4: string | null;
    thb: number;
  } | null;
}

export function ledgerCard(d: LedgerData): OutgoingMessage {
  const shouldSendUsdt = d.fixedRate ? d.totalThb / d.fixedRate : d.totalIncomingUsdt;
  const notSent = shouldSendUsdt - d.totalOutgoingUsdt;

  const inLines = d.incomingList
    .slice(0, 8)
    .map((e) => `${e.time}  ${money(e.thb).padStart(10)}  ${fmtUsdt(e.usdt).padStart(10)}`)
    .join('\n');
  const outLines = d.outgoingList
    .slice(0, 8)
    .map((e) => `${e.time}  ${fmtUsdt(e.usdt).padStart(10)}`)
    .join('\n');

  const pin =
    d.pinnedBanks && d.pinnedBanks.length
      ? d.pinnedBanks
          .map((b) => `${b.bank_name} ••••${b.last4}`)
          .join(' · ')
      : null;

  const body =
    (d.nowLabel ? `<i>${esc(d.nowLabel)}</i>\n\n` : '') +
    (pin ? `Pinned\n<code>${esc(pin)}</code>\n\n` : '') +
    `IN  <code>${d.incomingList.length}</code>\n` +
    (inLines ? `<pre>${esc(inLines)}</pre>\n` : `<i>— empty —</i>\n`) +
    `\nOUT  <code>${d.outgoingList.length}</code>\n` +
    (outLines ? `<pre>${esc(outLines)}</pre>\n` : `<i>— empty —</i>\n`) +
    `\n` +
    metrics([
      { label: 'Total THB', value: money(d.totalThb) },
      ...(d.fixedRate ? [{ label: 'Sell Rate', value: money(d.fixedRate) }] : []),
      { label: 'Should Send USDT', value: fmtUsdt(shouldSendUsdt) },
      { label: 'Sent USDT', value: fmtUsdt(d.totalOutgoingUsdt) },
      { label: 'Remaining USDT', value: fmtUsdt(notSent) },
      {
        label: 'Net Profit',
        value: `${d.netProfitThb >= 0 ? '+' : ''}${money(d.netProfitThb)} THB`,
      },
      ...(d.lastAdminName ? [{ label: 'Last Operator', value: d.lastAdminName }] : []),
    ]) +
    (d.staff?.length
      ? `\n\nStaff\n` +
        monoRows(
          d.staff
            .slice(0, 5)
            .map(
              (s) =>
                [s.name.slice(0, 10), `${s.count} · ${money(s.profitThb)}`] as [string, string],
            ),
        )
      : '') +
    formatRecentBlock(d.recent);

  // Keep under Telegram 4096
  const msg = card({
    kind: 'HISTORY',
    subtitle: d.roomName ? `Secure Ledger · ${d.roomName}` : 'Secure Ledger',
    body,
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'New day', callback_data: 'newday:1' },
          { text: 'Reset room', callback_data: 'resetask:1' },
        ],
        ...(APP ? [[{ text: 'Dashboard', url: `${APP}/dashboard` }]] : []),
      ],
    },
  });
  if (msg.text.length > 3900) {
    msg.text = msg.text.slice(0, 3890) + '\n…';
  }
  return msg;
}

export function menuCard(): OutgoingMessage {
  return card({
    kind: 'MENU',
    body:
      `<b>Operations</b>\n` +
      `THB slip → OCR verify\n` +
      `USDT proof or <code>-13.6U</code>\n\n` +
      `<b>Input</b>\n${FORMAT_HINT}\n\n` +
      `<b>Commands</b>\n` +
      `<code>/admin NAME</code>  identity\n` +
      `<code>/today</code>  room ledger\n` +
      `<code>/pin kbank 1234</code>  receive acct\n` +
      `<code>/unpin 1</code>  remove pin\n` +
      `<code>/newday</code>  day cut\n` +
      `<code>/setrate 40</code>  room sell\n` +
      `<code>/rate</code>  market\n` +
      `<code>/receiver 6578</code>  history\n` +
      `<code>/cancel</code>  abort`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Today', callback_data: 'menu_today:1' },
          { text: 'Pins', callback_data: 'pin_status:1' },
        ],
        [{ text: 'New day', callback_data: 'newday:1' }],
        ...(APP ? [[{ text: 'Dashboard', url: `${APP}/dashboard` }]] : []),
      ],
    },
  });
}

export function resetAsk(roomName?: string | null): OutgoingMessage {
  return card({
    kind: 'DELETE',
    status: 'REVIEW',
    body:
      `Reset room ledger` +
      (roomName ? `\n<code>${esc(roomName)}</code>` : '') +
      `\n\nDeletes all transactions in this room\nIrreversible · other rooms untouched`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Confirm reset', callback_data: 'resetgo:1' },
          { text: 'Cancel', callback_data: 'cancelop:1' },
        ],
      ],
    },
  });
}

export function resetDone(count: number): OutgoingMessage {
  return card({
    kind: 'DELETE',
    status: 'SETTLED',
    body: metrics([{ label: 'Removed', value: String(count) }]),
    note: 'Room counters reset to zero',
  });
}

export function roomNameSet(name: string): OutgoingMessage {
  return card({
    kind: 'ROOM',
    status: 'SETTLED',
    body: metrics([{ label: 'Room', value: name }]),
  });
}

export function newDayStarted(atLabel: string): OutgoingMessage {
  return card({
    kind: 'DAY',
    status: 'SETTLED',
    body: metrics([{ label: 'Day cut', value: atLabel }]),
    note: 'Prior volume remains in history',
  });
}

// ═══════════════ Receiver history ═══════════════
export interface ReceiverCardData {
  bank: string | null;
  last4: string;
  name?: string | null;
  status?: string;
  totalTx?: number;
  totalThb?: number;
  totalUsdt?: number;
  maxThb?: number;
  lastThb?: number;
  lastAt?: string | null;
  lastRef?: string | null;
  todayCount?: number;
  todayThb?: number;
}

const fmtDT = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Bangkok',
      })
    : '-';

export function receiverBrief(
  r: ReceiverCardData | null,
  bank: string | null,
  last4: string,
): string {
  if (!r) {
    return `New receiver\n<code>${esc(bank ?? '-')} ••••${esc(last4)}</code>`;
  }
  const tag =
    r.status === 'trusted' ? 'TRUSTED' : r.status === 'blacklist' ? 'BLACKLIST' : 'KNOWN';
  return (
    `Receiver  <code>${tag}</code>\n` +
    `<code>${esc(r.bank ?? '-')} ••••${esc(r.last4)}</code>` +
    (r.name ? `\n${esc(r.name)}` : '') +
    `\nDeals <code>${r.totalTx ?? 0}</code> · THB <code>${money(r.totalThb ?? 0)}</code>`
  );
}

export function receiverCard(r: ReceiverCardData): OutgoingMessage {
  const tag =
    r.status === 'trusted' ? 'TRUSTED' : r.status === 'blacklist' ? 'BLACKLIST' : 'RECEIVER';
  const avg = r.totalTx ? (r.totalThb ?? 0) / r.totalTx : 0;
  return card({
    kind: 'HISTORY',
    subtitle: tag,
    body:
      metrics([
        { label: 'Account', value: `${r.bank ?? '-'} ••••${r.last4}` },
        ...(r.name ? [{ label: 'Name', value: r.name }] : []),
        { label: 'Deals', value: String(r.totalTx ?? 0) },
        { label: 'Total THB', value: money(r.totalThb ?? 0) },
        { label: 'Max THB', value: money(r.maxThb ?? 0) },
        { label: 'Last THB', value: money(r.lastThb ?? 0) },
        { label: 'Total USDT', value: fmtUsdt(r.totalUsdt ?? 0) },
        { label: 'Average', value: money(avg) },
        { label: 'Last seen', value: fmtDT(r.lastAt) },
      ]) + (r.lastRef ? `\n\nLedger  <code>#${esc(r.lastRef)}</code>` : ''),
  });
}

export function receiverNotFound(last4: string): OutgoingMessage {
  return card({
    kind: 'HISTORY',
    status: 'ERROR',
    body: `No receiver history\n<code>••••${esc(last4)}</code>`,
  });
}

// ═══════════════ Error ═══════════════
export function sanitizeErrorDetail(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return 'Unknown error';
  if (/requires an index|FAILED_PRECONDITION|create_composite/i.test(s)) {
    return 'Database index updating — retry shortly';
  }
  if (/permission denied|PERMISSION_DENIED/i.test(s)) {
    return 'Permission denied — contact admin';
  }
  if (/ADMIN_NOT_FOUND/i.test(s)) {
    return 'Admin not registered — use /admin NAME';
  }
  return s
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

export function error(detail: string): OutgoingMessage {
  return card({
    kind: 'ERROR',
    status: 'ERROR',
    body: `Operation failed\n\n<code>${esc(sanitizeErrorDetail(detail))}</code>`,
    note: 'Retry or escalate to system admin',
  });
}
