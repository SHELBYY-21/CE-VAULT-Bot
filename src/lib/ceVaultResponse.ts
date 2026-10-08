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
 * - DUE follows the canonical settlement convention (docs/settlement-delta-convention.md):
 *   dueUsdt = expectedUsdt − sentUsdt → positive = USDT still owed.
 *
 * Status alignment: the status set maps 1:1 to the real production pipeline —
 * pending_slips.status (OCR_FAILED, BANK_MISMATCH, STALE_SLIP, NEEDS_REVIEW,
 * PIN_REQUIRED, RATE_REQUIRED, MARKET_UNAVAILABLE, PROMOTION_FAILED, VERIFIED,
 * RECORDED + duplicate) and the tx lifecycle (ocr_success → waiting_admin → completed),
 * matching runtime-patches/live-intake.mjs formatIntakeV4Reply titles.
 *
 * Card style follows the owner's CE EMPIRE — WEB FLOW: BANK SLIP to USDT
 * mockup (650.jpg): CE EMPIRE branding header, step icons on the five-stage
 * trace (📄 OCR · 🛡️ MATCH · 💰 IN · ⏳ WAIT · ✅ DONE), bilingual step labels
 * (OCR สำเร็จ / AI VERIFIED / สำเร็จ DONE), and a closing rule that frames
 * every card like the mockup's glowing step borders.
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
  | 'ERROR'
  // Real production intake statuses (pending_slips.status)
  | 'OCR_FAILED'
  | 'BANK_MISMATCH'
  | 'STALE_SLIP'
  | 'NEEDS_REVIEW'
  | 'PIN_REQUIRED'
  | 'RATE_REQUIRED'
  | 'MARKET_UNAVAILABLE'
  | 'PROMOTION_FAILED'
  | 'VERIFIED';

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
  /** USDT already sent for this deal (sent_usdt column). */
  sentUsdt?: number | null;
  /**
   * USDT still owed to the customer. Canonical convention:
   * dueUsdt = expectedUsdt − sentUsdt → positive = still owed (DUE).
   * Rendered on RECORDED / WAIT_USDT cards. Callers derive it from the
   * Ledger's delta_usdt, never invent it here.
   */
  dueUsdt?: number | null;
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
    headline: 'OCR สำเร็จ',
    next: 'ระบบตรวจบัญชีอัตโนมัติ',
    stages: { OCR: 'done', MATCH: 'current', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  MATCH_PASS: {
    icon: '🟢',
    headline: 'AI VERIFIED — ตรวจสอบเรียบร้อย',
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
    headline: 'สำเร็จ DONE — SETTLED',
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
  // ── Real production intake statuses (pending_slips.status) ──
  OCR_FAILED: {
    icon: '🔴',
    headline: 'อ่านสลิปไม่สำเร็จ',
    next: 'ส่งภาพสลิปใหม่ที่ชัดขึ้น',
    stages: { OCR: 'failed', MATCH: 'pending', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: false,
  },
  BANK_MISMATCH: {
    icon: '🔴',
    headline: 'บัญชีในสลิปไม่ตรง',
    next: 'ตรวจเลขบัญชีในสลิปเทียบกับบัญชี PIN',
    stages: { OCR: 'done', MATCH: 'failed', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  STALE_SLIP: {
    icon: '🔴',
    headline: 'วันที่สลิปไม่ตรง',
    next: 'ตรวจวันของสลิปก่อนดำเนินการ',
    stages: { OCR: 'done', MATCH: 'failed', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  NEEDS_REVIEW: {
    icon: '🟡',
    headline: 'ต้องตรวจข้อมูลสลิป',
    next: 'ตรวจยอดและความมั่นใจ OCR ด้วยตา',
    stages: { OCR: 'done', MATCH: 'current', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  PIN_REQUIRED: {
    icon: '🟡',
    headline: 'ยังไม่ได้ PIN บัญชี',
    next: 'เลือกบัญชีรับเงินก่อนบันทึก',
    stages: { OCR: 'done', MATCH: 'current', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  RATE_REQUIRED: {
    icon: '🟡',
    headline: 'ยังไม่มีเรตห้อง',
    next: 'ตั้งเรตที่ตรวจสอบแล้ว',
    stages: { OCR: 'done', MATCH: 'current', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  MARKET_UNAVAILABLE: {
    icon: '🟡',
    headline: 'ยืนยันราคาไม่ได้',
    next: 'รอราคาตลาดที่ตรวจสอบได้',
    stages: { OCR: 'done', MATCH: 'current', IN: 'pending', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  PROMOTION_FAILED: {
    icon: '🔴',
    headline: 'ไม่สามารถยืนยันผลบันทึก',
    next: 'ตรวจ Ledger ก่อน retry เพื่อกันรายการซ้ำ',
    stages: { OCR: 'done', MATCH: 'done', IN: 'failed', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
  VERIFIED: {
    icon: '🟢',
    headline: 'ผ่านการตรวจ รอบันทึก',
    next: 'ระบบบันทึกด้วย promote RPC ที่มีอยู่',
    stages: { OCR: 'done', MATCH: 'done', IN: 'current', WAIT: 'pending', DONE: 'pending' },
    traceFrom: true,
  },
};

const RULE_HEAVY = '━━━━━━━━━━━━━━';
const RULE_LIGHT = '─────────────';

const fmt = (n: number | null | undefined, d = 2): string =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : n.toFixed(d);

// Step icons per the CE EMPIRE web-flow mockup: scan, verified shield,
// money in, hourglass wait, settled check.
const STAGE_ICON: Record<Stage, string> = { OCR: '📄', MATCH: '🛡️', IN: '💰', WAIT: '⏳', DONE: '✅' };

function traceLine(meta: StatusMeta): string {
  const mark: Record<StageState, string> = { done: '✓', current: '', pending: '', failed: '✗' };
  const stages: Stage[] = ['OCR', 'MATCH', 'IN', 'WAIT', 'DONE'];
  return stages.map((stage) => {
    const state = meta.stages[stage];
    const icon = STAGE_ICON[stage];
    if (state === 'current') return `${icon} [${stage}]`;
    if (state === 'pending') return `${icon} ${stage}`;
    return `${icon} ${stage} ${mark[state]}`;
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
    `◈ CE EMPIRE · SLIP→USDT · TX-${data.ref || '—'}`,
    `${meta.icon} ${meta.headline}`,
    RULE_HEAVY,
  ];

  if (status === 'OCR_RUNNING') {
    lines.push('ระบบกำลังประมวลผลภาพ ถัดไป: ตรวจบัญชีอัตโนมัติ');
    lines.push(RULE_HEAVY);
    return lines.join('\n');
  }

  const hasUsdt = data.usdt !== null && data.usdt !== undefined;
  lines.push(`📥 ${fmt(data.thb)} THB${hasUsdt ? ` → 💎 ${fmt(data.usdt, 6)} USDT` : ''}`);

  if (data.allChecksPass === true) {
    lines.push(`💱 RATE ${fmt(data.rate)} · 🟢 ALL CHECKS PASS`);
  } else if (data.rate !== null && data.rate !== undefined) {
    lines.push(`💱 RATE ${fmt(data.rate)}`);
  }

  // DUE per canonical convention: positive = USDT still owed (docs/settlement-delta-convention.md).
  // Caller-supplied from the Ledger's delta_usdt; never invented here.
  if (data.dueUsdt !== null && data.dueUsdt !== undefined) {
    lines.push(`💎 DUE ${fmt(data.dueUsdt, 6)} USDT`);
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
  } else if (status !== 'ERROR' && status !== 'OCR_FAILED' && status !== 'PROMOTION_FAILED') {
    if (data.bank || data.account) lines.push(`🏦 ${data.bank || '—'}${data.account ? ` · ${data.account}` : ''}`);
    if (data.name) lines.push(`👤 ${data.name}`);
  }

  lines.push(RULE_LIGHT);
  if (meta.traceFrom) lines.push(traceLine(meta));

  const issues = issueBlock(data);
  if (issues) lines.push(issues);

  lines.push(`NEXT: ${meta.next}`);
  if (status === 'DONE' && data.fullRef) lines.push(`REF ${data.fullRef} · ปิด ticket แล้ว`);
  lines.push(RULE_HEAVY);
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
