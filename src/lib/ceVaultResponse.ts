/**
 * CE VAULT / CE EMPIRE — Telegram Response V4
 * Presentation-only command-center contract.
 *
 * Invariants:
 * - RECORDED !== SETTLED.
 * - Missing data renders as "—"; never invent.
 * - "ALL CHECKS PASS" requires explicit evidence.
 * - Inline buttons are supplied only by callers that own real handlers.
 * - Max 3 buttons.
 */

export type Stage = 'OCR' | 'MATCH' | 'IN' | 'WAIT' | 'DONE';
export type StageState = 'done' | 'current' | 'pending' | 'failed';

export type TxStatus =
  | 'OCR_RUNNING'
  | 'OCR_OK'
  | 'MATCH_PASS'
  | 'MATCH_FAIL'
  | 'READY'
  | 'RECORDED'
  | 'WAIT_USDT'
  | 'DONE'
  | 'DUPLICATE'
  | 'ERROR';

export type RealAction = 'dealok' | 'dealedit' | 'cancelop' | 'edit' | 'del';

export interface TxAction {
  id: RealAction;
  label: string;
  arg: string;
}

export interface TxCheckIssue {
  label: string;
  expected?: string;
  found?: string;
}

export interface TxData {
  ref: string;
  thb?: number | null;
  usdt?: number | null;
  rate?: number | null;
  bank?: string | null;
  account?: string | null;
  name?: string | null;
  ocrConfidence?: number | null;
  allChecksPass?: boolean;
  checks?: TxCheckIssue[];
  issues?: string[];
  duplicateOfRef?: string | null;
  fullRef?: string | null;
  actions?: TxAction[];
}

interface StatusMeta {
  icon: string;
  headline: string;
  next: string;
  stages: Record<Stage, StageState>;
  traceFrom: boolean;
}

export const STATUS_MAP: Record<TxStatus, StatusMeta> = {
  OCR_RUNNING: {
    icon: '⚙️',
    headline: 'กำลังอ่านสลิป — รอสักครู่',
    next: 'ระบบตรวจบัญชีอัตโนมัติเมื่ออ่านเสร็จ',
    stages: { OCR: 'current', MATCH: 'pending', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: false,
  },
  OCR_OK: {
    icon: '✅',
    headline: 'อ่านสลิปสำเร็จ',
    next: 'ระบบตรวจบัญชีอัตโนมัติ',
    stages: { OCR: 'done', MATCH: 'current', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  MATCH_PASS: {
    icon: '🟢',
    headline: 'ตรวจบัญชีผ่าน',
    next: 'ดำเนินการตาม action ที่ระบบเปิดไว้',
    stages: { OCR: 'done', MATCH: 'done', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  MATCH_FAIL: {
    icon: '🔴',
    headline: 'ข้อมูลไม่ตรงบัญชี — ต้องตรวจก่อน',
    next: 'ตรวจสลิปต้นฉบับและใช้ action ที่ระบบอนุญาต',
    stages: { OCR: 'done', MATCH: 'failed', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  READY: {
    icon: '🟡',
    headline: 'พร้อมดำเนินการ — รอคำสั่ง',
    next: 'ใช้ action ที่ระบบเปิดไว้',
    stages: { OCR: 'done', MATCH: 'done', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  RECORDED: {
    icon: '✅',
    headline: 'บันทึกเข้าระบบแล้ว — ยังไม่จบรายการ',
    next: 'รอ USDT / completion event ที่ตรวจสอบได้',
    stages: { OCR: 'done', MATCH: 'done', IN: 'done', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  WAIT_USDT: {
    icon: '🟡',
    headline: 'รอ USDT — ยังไม่ SETTLE',
    next: 'รอหลักฐานหรือ completion event จริง',
    stages: { OCR: 'done', MATCH: 'done', IN: 'done', WAIT: 'current', DONE: 'pending' },
    traceFrom: true,
  },
  DONE: {
    icon: '💎',
    headline: 'จบรายการเรียบร้อย — SETTLED',
    next: 'ปิด ticket แล้ว',
    stages: { OCR: 'done', MATCH: 'done', IN: 'done', WAIT: 'done', DONE: 'done' },
    traceFrom: true,
  },
  DUPLICATE: {
    icon: '⛔',
    headline: 'พบรายการซ้ำ — ห้ามบันทึกซ้ำ',
    next: 'ตรวจสลิปเดิมก่อนดำเนินการ',
    stages: { OCR: 'done', MATCH: 'failed', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: false,
  },
  ERROR: {
    icon: '🔴',
    headline: 'ระบบผิดพลาด — ต้องตรวจสถานะก่อน',
    next: 'ตรวจ Ledger ก่อน retry เพื่อกันบันทึกซ้ำ',
    stages: { OCR: 'pending', MATCH: 'pending', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: false,
  },
};

const RULE_HEAVY = '━━━━━━━━━━━━━━';
const RULE_LIGHT = '─────────────';

const fmt = (n: number | null | undefined, d = 2): string =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : n.toFixed(d);

function traceLine(meta: StatusMeta): string {
  const mark: Record<StageState, string> = { done: '✓', current: '', pending: '', failed: '✗' };
  const stages: Stage[] = ['OCR', 'MATCH', 'IN', 'WAIT', 'DONE'];
  return stages.map((stage) => {
    const state = meta.stages[stage];
    if (state === 'current') return `[${stage}]`;
    if (state === 'pending') return stage;
    return `${stage} ${mark[state]}`;
  }).join(' ─ ');
}

function issueBlock(data: TxData): string {
  const lines: string[] = [];
  for (const issue of data.issues ?? []) lines.push(`🔍 ISSUE: ${issue}`);
  for (const check of data.checks ?? []) {
    lines.push(`🔍 ISSUE: ${check.label}`);
    if (check.expected !== undefined) lines.push(`· สลิป: ${check.expected}`);
    if (check.found !== undefined) lines.push(`· ระบบ: ${check.found}`);
  }
  return lines.join('\n');
}

export function buildMessage(status: TxStatus, data: TxData): string {
  const meta = STATUS_MAP[status];
  const lines: string[] = [
    `◈ CE · TX-${data.ref || '—'}`,
    `${meta.icon} ${meta.headline}`,
    RULE_HEAVY,
  ];

  if (status === 'OCR_RUNNING') {
    lines.push('ระบบกำลังประมวลผลภาพ ถัดไป: ตรวจบัญชีอัตโนมัติ');
    return lines.join('\n');
  }

  const hasUsdt = data.usdt !== null && data.usdt !== undefined;
  lines.push(`📥 ${fmt(data.thb)} THB${hasUsdt ? ` → 💎 ${fmt(data.usdt, 6)} USDT` : ''}`);

  if (data.allChecksPass === true) {
    lines.push(`💱 RATE ${fmt(data.rate)} · 🟢 ALL CHECKS PASS`);
  } else if (data.rate !== null && data.rate !== undefined) {
    lines.push(`💱 RATE ${fmt(data.rate)}`);
  }

  if (
    data.ocrConfidence !== null &&
    data.ocrConfidence !== undefined &&
    Number.isFinite(data.ocrConfidence) &&
    data.ocrConfidence < 95
  ) {
    lines.push(`🟡 OCR ${data.ocrConfidence.toFixed(1)}% — ต่ำกว่าเกณฑ์ ตรวจสอบด้วยตา`);
  }

  if (status === 'DUPLICATE') {
    lines.push(`⚠️ ตรงกับ TX-${data.duplicateOfRef || '—'}`);
  } else if (status !== 'ERROR') {
    if (data.bank || data.account) lines.push(`🏦 ${data.bank || '—'}${data.account ? ` · ${data.account}` : ''}`);
    if (data.name) lines.push(`👤 ${data.name}`);
  }

  lines.push(RULE_LIGHT);
  if (meta.traceFrom) lines.push(traceLine(meta));

  const issues = issueBlock(data);
  if (issues) lines.push(issues);

  lines.push(`NEXT: ${meta.next}`);
  if (status === 'DONE' && data.fullRef) lines.push(`REF ${data.fullRef} · ปิด ticket แล้ว`);
  return lines.join('\n');
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export function buildKeyboard(data: TxData): InlineButton[][] | undefined {
  const actions = (data.actions ?? []).slice(0, 3);
  if (!actions.length) return undefined;
  return [actions.map((action) => ({
    text: action.label,
    callback_data: `${action.id}:${action.arg}`,
  }))];
}
