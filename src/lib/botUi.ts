// ============================================================
// CE VAULT — Bot message theme v2 (colorful, animated, distinctive)
// ใช้ HTML + emoji + spoiler + gradient-blocks ให้ดูล้ำสมัยที่สุดในขีดจำกัด Telegram
// ============================================================
import { randomBytes } from 'crypto';
import type { OutgoingMessage } from './telegram';

const APP_RAW = (process.env.APP_URL || '').replace(/\/$/, '');
const APP = APP_RAW.startsWith('https://') && !APP_RAW.includes('localhost') ? APP_RAW : '';
const FEE_WARN = Number(process.env.FEE_WARNING_THRESHOLD || 3);

// ═══════════════ Design tokens (Fintech: โทนเข้ม, accent เดียว, ตัวเลข monospace) ═══════════════
const MARK = '⬢';
const BRAND = `${MARK} <b>CE VAULT</b>`;
const THIN = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';
// accent เส้นเดียว + จุดสีบอกสถานะ (แทนบล็อกเขียวรัวๆ ให้อ่านง่ายขึ้น)
const GRAD_INDIGO = '🔷 ━━━━━━━━━━━━━';
const GRAD_GOLD   = '🟡 ━━━━━━━━━━━━━';
const GRAD_GREEN  = '🟢 ━━━━━━━━━━━━━';
const GRAD_RED    = '🔴 ━━━━━━━━━━━━━';
const SIG = `<i>${MARK} CE VAULT · secure ledger</i>`;

const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (n: number) => nf.format(Number(n) || 0);
const pct = (n: number) => `${(Number(n) || 0).toFixed(2)}%`;

// ตาราง monospace จัดคอลัมน์ตัวเลขให้ตรงกัน (label ASCII, value ชิดขวา)
function table(rows: [string, string][], width = 15): string {
  const body = rows.map(([k, v]) => k.padEnd(6) + v.padStart(width - 6)).join('\n');
  return `<pre>${body}</pre>`;
}

// Ledger ID: #CE-YYYYMMDD-XXXX (XXXX = 4 ตัวแรกของ uuid) — ค้นย้อนหลังง่าย
export function refCode(txId: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = (txId || '').replace(/-/g, '').slice(0, 4).toUpperCase() || '----';
  return `CE-${ymd}-${tail}`;
}

// Ledger ID ใหม่สำหรับดีล (สร้างตอนรับสลิป ก่อนมี txId) — คงที่ตลอดดีล
export function newLedgerRef(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `CE-${ymd}-${rand}`;
}

// แถบ progress 5 ขั้น: รับสลิป → OCR → รอ USDT → ส่งเหรียญ → เสร็จ
type Step = 1 | 2 | 3 | 4 | 5;
function progress(current: Step): string {
  const steps = ['รับสลิป', 'OCR', 'รอ USDT', 'คำนวณ', 'เสร็จ'];
  return steps
    .map((label, i) => {
      const n = (i + 1) as Step;
      const icon = n < current ? '✅' : n === current ? '🟡' : '▫️';
      return `${icon} ${label}`;
    })
    .join('  ');
}

// tier badge ตามกำไร %
function profitTier(pctVal: number): string {
  if (pctVal >= 5) return '🏆 <b>EXCELLENT</b>';
  if (pctVal >= 2) return '💎 <b>GREAT</b>';
  if (pctVal >= 0) return '✨ <b>GOOD</b>';
  if (pctVal >= -2) return '⚠️ <b>WATCH</b>';
  return '🔻 <b>LOSS</b>';
}

// ปุ่ม inline — edit/delete เป็น callback (ใช้ได้กับทุก URL), ปุ่มลิงก์ต้อง https
function buttons(transactionId?: string): unknown {
  const rows: any[][] = [];
  if (transactionId) {
    rows.push([
      { text: '⚡ แก้ไขข้อมูล', callback_data: `edit:${transactionId}` },
      { text: '🗑 ลบธุรกรรม', callback_data: `del:${transactionId}` },
    ]);
  }
  if (APP) {
    if (transactionId)
      rows.push([{ text: '🔎 เปิดรายละเอียด →', url: `${APP}/dashboard/transactions/${transactionId}` }]);
    rows.push([{ text: '📊 แดชบอร์ด CE Vault', url: `${APP}/dashboard` }]);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

// ═══════════════ Welcome / Onboarding ═══════════════
export function welcomeRegistered(name: string): OutgoingMessage {
  return {
    text:
      `${GRAD_INDIGO}\n` +
      `${BRAND}  <i>· secure USDT ledger</i>\n` +
      `${GRAD_INDIGO}\n` +
      `🔐 ยินดีต้อนรับกลับ <b>${name}</b>\n` +
      `${THIN}\n` +
      `<b>①  ฝาก THB → USDT</b>\n` +
      `<blockquote>ส่งรูปสลิป แล้วพิมพ์ USDT ที่ได้จริง\n` +
      `<code>11</code>  หรือ  <code>5000 11 35.5 34.8</code></blockquote>\n` +
      `<b>②  ส่ง USDT ให้ทุนจีน</b>\n` +
      `<blockquote>ส่งรูปสลิป + แคปชัน <code>ส่ง usdt</code> แล้วพิมพ์จำนวน</blockquote>\n` +
      `<b>③  เรตตลาด</b>  <code>/rate</code> ดู · <code>/rate 35.5</code> ตั้งเรตขาย\n` +
      `${THIN}\n` +
      `${SIG}`,
    reply_markup: buttons(),
  };
}

export function askName(): OutgoingMessage {
  return {
    text:
      `${GRAD_INDIGO}\n` +
      `${BRAND}  <i>· ยินดีต้อนรับ</i>\n` +
      `${GRAD_INDIGO}\n` +
      `🔐 ก่อนเริ่มใช้งาน ขอทราบ<b>ชื่อของคุณ</b>ก่อนครับ\n` +
      `${THIN}\n` +
      `<i>พิมพ์ชื่อที่อยากให้ระบบเรียก เช่น</i>  <code>แอดมิน A</code>\n` +
      `${SIG}`,
  };
}

export function registered(name: string): OutgoingMessage {
  return {
    text:
      `${GRAD_GREEN}\n` +
      `✅ <b>ลงทะเบียนสำเร็จ</b>\n` +
      `${GRAD_GREEN}\n` +
      `${MARK} ยินดีต้อนรับสู่ <b>CE VAULT</b>, <b>${name}</b>\n` +
      `${THIN}\n` +
      `🚀 เริ่มได้เลย: ส่ง<b>รูปสลิป</b> แล้วพิมพ์จำนวน USDT\n` +
      `${SIG}`,
    reply_markup: buttons(),
  };
}

// ═══════════════ Upload progress (multi-step edit animation) ═══════════════
export function uploading(step = 0): OutgoingMessage {
  // แถบวิ่ง 4 เฟรม — bridge/webhook edit ต่อกันจะดูเหมือน progress bar
  const frames = ['🟨⬜⬜⬜⬜', '🟨🟨⬜⬜⬜', '🟨🟨🟨⬜⬜', '🟩🟩🟩🟩🟩'];
  const label = ['กำลังอัปโหลด', 'กำลังประมวลผล', 'กำลังบันทึก', 'พร้อม'][Math.min(step, 3)];
  return {
    text:
      `${MARK} <b>CE VAULT</b>\n${THIN}\n` +
      `${frames[Math.min(step, 3)]}\n` +
      `<i>${label}...</i>`,
  };
}

export interface SlipReadyData {
  type: 'THB_DEPOSIT' | 'USDT_SEND';
  thb?: number | null;
  date?: string | null;
  time?: string | null;
  last4?: string | null;
  bank?: string | null;
  receiverName?: string | null;
  confidence?: number | null;    // ความมั่นใจ OCR 0-100
  chatRate?: number | null;      // เรตต่อกลุ่มที่ตั้งไว้
  historyLine?: string | null;   // บรรทัด Receiver History (จาก receiverBrief)
}

// แสดงความมั่นใจ OCR + สัญญาณเตือน
function confidenceLine(c?: number | null): string {
  if (c == null) return '';
  const dot = c >= 90 ? '🟢' : c >= 75 ? '🟡' : '🔴';
  return `${dot} ความมั่นใจ <i>(Confidence)</i>  <b>${c.toFixed(1)}%</b>`;
}

export function slipReady(d: SlipReadyData): OutgoingMessage {
  if (d.type === 'USDT_SEND') {
    return {
      text:
        `${GRAD_GOLD}\n${MARK} <b>CE VAULT</b>  <i>· ส่ง USDT</i>\n` +
        `${progress(3)}\n${THIN}\n` +
        `🚀 พิมพ์จำนวน USDT ที่ส่ง เช่น <code>11</code>`,
    };
  }

  // THB_DEPOSIT
  const conf = d.confidence ?? null;
  const gotAmount = d.thb != null && d.thb > 0;
  const lowConf = conf != null && conf < 90;

  // header สะท้อนความจริง: อ่านยอดไม่ได้ / ความมั่นใจต่ำ / สำเร็จ
  const header = !gotAmount
    ? '⚠️ <b>อ่านยอดไม่สำเร็จ</b>'
    : lowConf
      ? '⚠️ <b>ตรวจสอบสลิปอีกครั้ง</b>'
      : '✅ <b>OCR สำเร็จ</b>';

  const detail: string[] = [];
  if (gotAmount) detail.push(`💵 ยอดเงิน   <b>${money(d.thb!)} บาท</b>`);
  if (d.receiverName) detail.push(`👤 ผู้รับ     <b>${d.receiverName}</b>`);
  if (d.last4 || d.bank)
    detail.push(`🏦 ธนาคาร   <b>${d.bank ?? '-'}</b>${d.last4 ? `  <code>>>${d.last4}</code>` : ''}`);
  if (d.date || d.time) detail.push(`📅 เวลา     <b>${d.date ?? ''} ${d.time ?? ''}</b>`.trimEnd());
  const cLine = confidenceLine(conf);
  if (cLine) detail.push(cLine);

  const canAuto = !!(d.chatRate && gotAmount);
  const usdtAuto = canAuto ? d.thb! / d.chatRate! : 0;

  let ask: string;
  if (!gotAmount) {
    // OCR อ่านยอดไม่ได้ → ต้องให้พิมพ์ยอด+เรตเอง (ห้าม fallback 5000)
    ask = `พิมพ์ <b>ยอดบาท เรต</b> เช่น <code>500 36.65</code>\n<i>ระบบจะคำนวณ USDT ให้</i>`;
  } else if (canAuto) {
    ask =
      `🧮 <code>${money(d.thb!)} ÷ ${money(d.chatRate!)} = ${money(usdtAuto)} USDT</code>\n` +
      `กดปุ่ม <b>ยืนยัน</b> ด้านล่าง หรือพิมพ์เรตใหม่`;
  } else {
    ask = `พิมพ์ <b>เรตแลก</b> เช่น <code>36.65</code> → ระบบคำนวณ USDT ให้`;
  }

  return {
    text:
      `${!gotAmount || lowConf ? GRAD_RED : GRAD_GREEN}\n` +
      `${MARK} <b>CE VAULT</b>  ${header}  <tg-spoiler>Grok</tg-spoiler>\n` +
      `${progress(2)}\n${THIN}\n` +
      (detail.length ? detail.join('\n') + `\n${THIN}\n` : '') +
      (gotAmount && lowConf ? `<i>ความมั่นใจต่ำกว่า 90% — โปรดตรวจยอดก่อนยืนยัน</i>\n${THIN}\n` : '') +
      ask +
      (d.historyLine ? `\n${d.historyLine}` : ''),
    reply_markup: canAuto
      ? {
          inline_keyboard: [
            [{ text: `✅ ยืนยัน (${money(usdtAuto)} USDT)`, callback_data: `confirm:${usdtAuto.toFixed(2)}` }],
          ],
        }
      : undefined,
  };
}

// ═══════════════ รูปแบบการพิมพ์ยอด (ระบุชัดเจน ไม่ให้บอทเดา) ═══════════════
const FORMAT_HINT =
  `<b>+500B</b>   บาทเข้า  <i>(THB in)</i>\n` +
  `<b>-13.6U</b>  USDT ออก  <i>(USDT out)</i>\n` +
  `<i>รวมกันได้ · เขียนเต็มก็ได้:</i>  <code>+500B -13.6U</code>  ·  <code>+500THB -13.6USDT</code>`;

/** เลขลอยๆ ไม่ระบุสกุล → บอทไม่เดา ขอรูปแบบที่ชัดเจน */
export function amountFormatHelp(): OutgoingMessage {
  return {
    text:
      `${GRAD_GOLD}\n` +
      `✋ <b>ต้องระบุสกุลเงินให้ชัด</b>\n` +
      `${THIN}\n` +
      `ระบบไม่เดายอดให้ — ใส่เครื่องหมาย + / − และสกุล B / U\n` +
      `${THIN}\n` +
      FORMAT_HINT,
  };
}

/** ทิศทางผิด (เช่น -500B หรือ +300U) */
export function wrongDirection(cur: 'THB' | 'USDT'): OutgoingMessage {
  const msg =
    cur === 'THB'
      ? `ยอด<b>บาท</b>ในดีลนี้คือเงิน<b>เข้า</b> → ใช้ <code>+500B</code>`
      : `ยอด<b>USDT</b>ในดีลนี้คือเหรียญ<b>ออก</b> → ใช้ <code>-13.6U</code>`;
  return {
    text: `${GRAD_RED}\n⚠️ <b>ทิศทางไม่ถูก</b>\n${THIN}\n${msg}`,
  };
}

/** ตั้งยอดบาทแล้ว รอ USDT */
export function thbSetWaitUsdt(thb: number): OutgoingMessage {
  return {
    text:
      `✅ ตั้งยอดบาท  <b>${money(thb)} ฿</b>\n` +
      `${THIN}\n` +
      `⏳ ต่อไป: ส่ง<b>สกรีนช็อต USDT</b> หรือพิมพ์ <code>-13.6U</code>`,
  };
}

/** มี USDT แต่ยังไม่รู้ยอดบาท */
export function needThb(): OutgoingMessage {
  return {
    text:
      `${GRAD_GOLD}\n` +
      `⚠️ <b>ยังไม่ทราบยอดบาท</b>\n` +
      `${THIN}\n` +
      `อ่านจากสลิปไม่ได้ — พิมพ์ยอดบาทด้วย เช่น <code>+500B -13.6U</code>`,
  };
}

// ═══════════════ Deal flow v5: THB slip → wait USDT → confirm ═══════════════
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

/** การ์ดหลัง OCR สลิป THB → รอ USDT (step ③) */
export function waitUsdt(d: WaitUsdtData): OutgoingMessage {
  const conf = d.confidence ?? null;
  const gotAmount = d.thb != null && d.thb > 0;
  const lowConf = conf != null && conf < 90;
  const header = !gotAmount ? '⚠️ <b>อ่านยอดไม่สำเร็จ</b>' : lowConf ? '⚠️ <b>ตรวจสอบสลิป</b>' : '✅ <b>OCR สำเร็จ</b>';

  const detail: string[] = [];
  if (gotAmount) detail.push(`💵 ยอดเงิน <i>(Amount)</i>  <b>${money(d.thb!)} THB</b>`);
  if (d.receiverName) detail.push(`👤 ผู้รับ <i>(Receiver)</i>  <b>${d.receiverName}</b>`);
  if (d.bank || d.last4) detail.push(`🏦 ธนาคาร <i>(Bank)</i>  <b>${d.bank ?? '-'}</b>${d.last4 ? `  <code>••••${d.last4}</code>` : ''}`);
  if (d.date || d.time) detail.push(`📅 เวลา <i>(Date/Time)</i>  <b>${d.date ?? ''} ${d.time ?? ''}</b>`.trimEnd());
  const cLine = confidenceLine(conf);
  if (cLine) detail.push(cLine);

  return {
    text:
      `${!gotAmount || lowConf ? GRAD_RED : GRAD_GREEN}\n` +
      `${MARK} <b>CE VAULT</b>  ${header}  <tg-spoiler>Grok</tg-spoiler>\n` +
      `${progress(3)}\n${THIN}\n` +
      `🧾 <b>Ledger ID</b>  <code>#${d.ledgerRef}</code>\n` +
      (detail.length ? detail.join('\n') + `\n` : '') +
      (d.roomRate ? `🏷 เรตขาย <i>(Sell Rate)</i>${d.roomName ? ` · ${d.roomName}` : ''}  <b>${money(d.roomRate)}</b>\n` : '') +
      (gotAmount && lowConf ? `<i>ความมั่นใจต่ำกว่า 90% — โปรดตรวจยอด (verify before confirm)</i>\n` : '') +
      (d.historyLine ? `${d.historyLine}\n` : '') +
      `${THIN}\n` +
      `⏳ <b>รอยืนยัน USDT</b> <i>(Awaiting USDT)</i>\n` +
      `ส่ง <b>สกรีนช็อตโอน USDT</b> หรือพิมพ์:\n` +
      FORMAT_HINT,
  };
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

/** การ์ดยืนยันดีล (step ④) — Confirm / Edit / Cancel */
export function dealConfirm(d: DealConfirmData): OutgoingMessage {
  const up = d.profitThb >= 0;
  return {
    text:
      `${GRAD_GOLD}\n` +
      `${MARK} <b>CE VAULT</b>  <i>· ตรวจก่อนบันทึก (Review)</i>\n` +
      `${progress(4)}\n${THIN}\n` +
      `🧾 <b>Ledger ID</b>  <code>#${d.ledgerRef}</code>\n` +
      table([
        ['THB', money(d.thb)],
        ['USDT', money(d.usdt)],
        ['Buy', money(d.buyRate)],
        ['Sell', money(d.sellRate)],
      ]) +
      `${up ? '📈' : '📉'} กำไรประเมิน <i>(Est. Profit)</i>  <b>${up ? '+' : ''}${money(d.profitThb)} THB</b>\n` +
      (d.receiverName || d.last4
        ? `👤 ผู้รับ <i>(Receiver)</i>  <b>${d.receiverName ?? '-'}</b>${d.last4 ? ` <code>${d.bank ?? ''}••••${d.last4}</code>` : ''}\n`
        : '') +
      (d.network ? `🔗 เครือข่าย <i>(Network)</i>  <b>${d.network}</b>\n` : '') +
      `${THIN}\n<i>ตรวจแล้วกด</i> <b>ยืนยัน (Confirm)</b>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ ยืนยัน', callback_data: `dealok:${d.ledgerRef}` },
          { text: '✏️ แก้ USDT', callback_data: 'dealedit:1' },
          { text: '✖️ ยกเลิก', callback_data: 'cancelop:1' },
        ],
      ],
    },
  };
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

/** การ์ดบันทึกสำเร็จ (step ⑤) */
export function dealSuccess(d: DealSuccessData): OutgoingMessage {
  const up = d.profitThb >= 0;
  return {
    text:
      `${up ? GRAD_GREEN : GRAD_RED}\n` +
      `${BRAND}  <i>· บันทึกสำเร็จ (Recorded)</i>\n` +
      `${progress(5)}\n${THIN}\n` +
      `🧾 <b>Ledger ID</b>  <code>#${d.ledgerRef}</code>\n` +
      `👤 <b>${d.adminName}</b>  <i>(Staff)</i>\n` +
      table([
        ['THB', money(d.thb)],
        ['USDT', money(d.usdt)],
        ['Buy', money(d.buyRate)],
        ['Sell', money(d.sellRate)],
      ]) +
      `${up ? '📈' : '📉'} กำไร <i>(Profit)</i>  <b>${up ? '+' : ''}${money(d.profitThb)} THB</b>\n` +
      (d.receiverName || d.last4
        ? `👤 ${d.receiverName ?? '-'}${d.last4 ? `  <code>${d.bank ?? ''}••••${d.last4}</code>` : ''}\n`
        : '') +
      `${SIG}`,
    reply_markup: buttons(d.transactionId),
  };
}

/** req13: OCR USDT ไม่ตรงกับที่พิมพ์เอง → บล็อกการยืนยัน ต้องตรวจสอบเอง */
export function usdtMismatch(ocrVal: number, manualVal: number): OutgoingMessage {
  return {
    text:
      `${GRAD_RED}\n` +
      `🛑 <b>USDT ไม่ตรงกัน — ต้องตรวจสอบ</b>\n` +
      `${THIN}\n` +
      table([
        ['OCR', money(ocrVal)],
        ['พิมพ์', money(manualVal)],
        ['ต่าง', money(Math.abs(ocrVal - manualVal))],
      ]) +
      `<i>ระบบระงับการยืนยันไว้ก่อน</i>\n` +
      `ส่ง <b>สกรีนช็อต USDT</b> ที่ถูกต้องอีกครั้ง หรือพิมพ์จำนวนที่ถูก\n` +
      `<i>พิมพ์</i> <code>/cancel</code> <i>เพื่อยกเลิก</i>`,
  };
}

// ═══════════════ Confirm before commit (ลดส่งผิด) ═══════════════
export function confirmDeposit(thb: number, usdt: number, rate: number): OutgoingMessage {
  return {
    text:
      `${GRAD_GOLD}\n` +
      `${MARK} <b>CE VAULT</b>  <i>· ตรวจก่อนบันทึก</i>\n` +
      `${progress(3)}\n${THIN}\n` +
      `กำลังจะบันทึกฝาก:\n` +
      table([
        ['THB', money(thb)],
        ['USDT', money(usdt)],
        ['Rate', money(rate)],
      ]) +
      `\n<i>กด</i> <b>ยืนยัน</b> <i>เพื่อบันทึก · หรือพิมพ์เรตใหม่</i>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ ยืนยัน', callback_data: `confirm:${usdt.toFixed(2)}` },
          { text: '✖️ ยกเลิก', callback_data: 'cancelop:1' },
        ],
      ],
    },
  };
}

export function confirmSend(usdt: number, holding: number): OutgoingMessage {
  return {
    text:
      `${GRAD_GOLD}\n` +
      `${MARK} <b>CE VAULT</b>  <i>· ตรวจก่อนส่ง</i>\n` +
      `${progress(4)}\n${THIN}\n` +
      `กำลังจะส่งออก:\n` +
      table([
        ['USDT', money(usdt)],
        ['คงเหลือ', money(holding - usdt)],
      ], 17) +
      `\n<i>กด</i> <b>ยืนยัน</b> <i>เพื่อส่ง</i>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ ยืนยันส่ง', callback_data: `confirmsend:${usdt.toFixed(2)}` },
          { text: '✖️ ยกเลิก', callback_data: 'cancelop:1' },
        ],
      ],
    },
  };
}

// ═══════════════ Rate ═══════════════
export function rateShow(
  sell: number,
  market: number,
  source?: 'binance_th' | 'manual' | 'default',
): OutgoingMessage {
  const src =
    source === 'binance_th'
      ? '🟢 <b>LIVE</b> Binance TH'
      : source === 'manual'
        ? '🟡 ตั้งเอง'
        : '⚪ ค่าเริ่มต้น';
  const spread = sell - market;
  const spreadPct = market > 0 ? (spread / market) * 100 : 0;
  return {
    text:
      `${GRAD_INDIGO}\n` +
      `${BRAND}  <i>· เรตปัจจุบัน</i>\n` +
      `${GRAD_INDIGO}\n` +
      `💱 เรตขาย <i>(Sell Rate)</i>  <b>${money(sell)} THB / USDT</b>\n` +
      `🌐 เรตตลาด <i>(Market)</i>  <b>${money(market)} THB / USDT</b>\n` +
      `      ${src}\n` +
      `${THIN}\n` +
      `📐 ส่วนต่าง <i>(Spread)</i>  <b>${money(spread)} THB</b>  <i>(${pct(spreadPct)})</i>\n` +
      `${THIN}\n` +
      `<i>ตั้งเรตขาย:</i> <code>/rate 35.5</code>\n` +
      `${SIG}`,
  };
}

export function rateSet(name: string | null | undefined, sell: number, market: number): OutgoingMessage {
  return {
    text:
      `${GRAD_GREEN}\n` +
      `✅ <b>ตั้งเรตใหม่สำเร็จ</b>\n` +
      `${GRAD_GREEN}\n` +
      `💱 เรตขาย   <b>${money(sell)} ฿</b>\n` +
      `🌐 เรตตลาด  <b>${money(market)} ฿</b>\n` +
      `${THIN}\n` +
      `<i>โดย ${name || 'แอดมิน'} · ${MARK} CE VAULT</i>`,
  };
}

// ═══════════════ Transaction success (headline card) ═══════════════
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
  const up = d.netProfitThb >= 0;
  const feeHot = d.feePercent > FEE_WARN;
  const grad = up ? GRAD_GREEN : GRAD_RED;
  const tier = profitTier(d.profitPercent);
  const rate = d.usdt > 0 ? d.thb / d.usdt : 0;

  return {
    text:
      `${grad}\n` +
      `${BRAND}  <i>· ฝากสำเร็จ</i>\n` +
      `${progress(5)}\n${THIN}\n` +
      `🧾 <code>#${refCode(d.transactionId)}</code>\n` +
      `👤 <b>${d.adminName}</b>   ${tier}\n` +
      table([
        ['THB', money(d.thb)],
        ['USDT', money(d.usdt)],
        ['Rate', money(rate)],
      ]) +
      `${up ? '📈' : '📉'} กำไรสุทธิ   <b>${up ? '+' : ''}${money(d.netProfitThb)} ฿</b>  <i>(${pct(d.profitPercent)})</i>\n` +
      `${feeHot ? '🔴' : '🟢'} ค่าธรรมเนียม  <b>${money(d.feeUsdt)} USDT</b>  <i>(${pct(d.feePercent)})</i>\n` +
      `${THIN}\n` +
      `💼 เหรียญตกค้าง · ${d.adminName}  <b>${money(d.holdingUsdt)} USDT</b> 🔒\n` +
      `${SIG}`,
    reply_markup: buttons(d.transactionId),
  };
}

export interface UsdtSendData {
  transactionId: string;
  adminName: string;
  usdt: number;
  holdingUsdt: number;
}
export function usdtSendSuccess(d: UsdtSendData): OutgoingMessage {
  return {
    text:
      `${GRAD_GOLD}\n` +
      `${BRAND}  <i>· ส่งออกทุนจีน</i>\n` +
      `${progress(5)}\n${THIN}\n` +
      `🧾 <code>#${refCode(d.transactionId)}</code>\n` +
      `👤 <b>${d.adminName}</b>\n` +
      table([
        ['ส่ง', money(d.usdt)],
        ['คงเหลือ', money(d.holdingUsdt)],
      ], 17) +
      `${SIG}`,
    reply_markup: buttons(d.transactionId),
  };
}

// ═══════════════ Edit flow ═══════════════
export function editPrompt(_type?: 'THB_DEPOSIT' | 'USDT_SEND'): OutgoingMessage {
  return {
    text:
      `${GRAD_GOLD}\n` +
      `${MARK} <b>CE VAULT</b>  ⚡ <i>โหมดแก้ไข</i>\n` +
      `${THIN}\n` +
      `พิมพ์ค่าใหม่ (ระบุสกุลเสมอ):\n` +
      FORMAT_HINT + `\n` +
      `${THIN}\n` +
      `<i>ใส่เฉพาะตัวที่จะแก้ก็ได้ · พิมพ์ </i><code>/cancel</code><i> เพื่อยกเลิก</i>`,
  };
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
  const up = (d.netProfitThb ?? 0) >= 0;
  const grad = isDep ? (up ? GRAD_GREEN : GRAD_RED) : GRAD_GOLD;
  const body = isDep
    ? `💵 THB    <code>${money(d.thb ?? 0)}</code>\n` +
      `🪙 USDT   <code>${money(d.usdt)}</code>\n` +
      `${THIN}\n` +
      `${up ? '📈' : '📉'} กำไรสุทธิ  <b>${money(d.netProfitThb ?? 0)} ฿</b>  <i>(${pct(d.profitPercent ?? 0)})</i>\n` +
      `🧾 ค่าธรรมเนียม  <b>${money(d.feeUsdt ?? 0)} USDT</b>  <i>(${pct(d.feePercent ?? 0)})</i>\n`
    : `🚀 ส่งออก   <b>${money(d.usdt)} USDT</b>\n${THIN}\n`;

  return {
    text:
      `${grad}\n` +
      `✏️ <b>แก้ไขสำเร็จ</b>  <i>· ${isDep ? 'THB → USDT' : 'ส่ง USDT'}</i>\n` +
      `${THIN}\n` +
      `🧾 <code>#${refCode(d.transactionId)}</code>\n` +
      `👤 <b>${d.adminName}</b>\n` +
      body +
      `${THIN}\n` +
      `💼 <i>เหรียญตกค้าง · ${d.adminName}</i>\n` +
      `      <b>${money(d.holdingUsdt)} USDT</b>  🔒\n` +
      `${SIG}`,
    reply_markup: buttons(d.transactionId),
  };
}

export function deleteSuccess(name: string, holding: number): OutgoingMessage {
  return {
    text:
      `${GRAD_RED}\n` +
      `🗑️ <b>ลบธุรกรรมแล้ว</b>\n` +
      `${GRAD_RED}\n` +
      `👤 <b>${name}</b>\n` +
      `💼 เหรียญตกค้างคงเหลือ  <b>${money(holding)} USDT</b>  🔒\n` +
      `${SIG}`,
  };
}

export function cancelled(): OutgoingMessage {
  return { text: `${MARK} ⚪ <i>ยกเลิกการแก้ไขแล้ว</i>` };
}

// ═══════════════ Chat rate ═══════════════
export function chatRateSet(rate: number): OutgoingMessage {
  return {
    text:
      `${GRAD_GREEN}\n` +
      `✅ <b>ตั้งเรตของห้องนี้แล้ว</b>\n` +
      `${GRAD_GREEN}\n` +
      `💱 เรตแลกในห้องนี้  <b>${money(rate)} ฿ / USDT</b>\n` +
      `${THIN}\n` +
      `<i>ตั้งแต่ตอนนี้ ระบบจะคำนวณ USDT ให้อัตโนมัติทุกครั้งที่ส่งสลิป</i>`,
  };
}

// ═══════════════ Ledger summary (สไตล์ Chinese calc bot) ═══════════════
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
  feePercent: number;         // ค่าธรรมเนียมรวม (%) — คิดจากเฉลี่ย tx
  netProfitThb: number;
  lastAdminName: string | null;
  roomName?: string | null;   // ชื่อห้อง (กลุ่ม)
  staff?: { name: string; count: number; profitThb: number }[]; // Top Staff
}

export function ledgerCard(d: LedgerData): OutgoingMessage {
  const incoming = d.incomingList
    .slice(0, 10)
    .map((e) => `<code>${e.time}</code>  ${money(e.thb)}${d.fixedRate ? ` / ${money(d.fixedRate)} = ${money(e.usdt)}` : ` → ${money(e.usdt)}u`}`)
    .join('\n');
  const outgoing = d.outgoingList
    .slice(0, 10)
    .map((e) => `<code>${e.time}</code>  <b>${money(e.usdt)}</b>`)
    .join('\n');

  const shouldSendUsdt = d.fixedRate ? d.totalThb / d.fixedRate : d.totalIncomingUsdt;
  const notSent = shouldSendUsdt - d.totalOutgoingUsdt;
  const notSentThb = notSent * (d.fixedRate ?? 0);

  return {
    text:
      `${GRAD_INDIGO}\n` +
      `${MARK} <b>CE VAULT</b>  <i>· ยอดวันนี้${d.roomName ? ` · ${d.roomName}` : ''}</i>\n` +
      `${GRAD_INDIGO}\n` +
      `🟢 <b>เข้าบัญชี</b> <i>(Incoming)</i> · ${d.incomingList.length} รายการ\n` +
      (incoming || '<i>— ยังไม่มี —</i>') +
      `\n${THIN}\n` +
      `🔴 <b>ส่งออก</b> <i>(Outgoing)</i> · ${d.outgoingList.length} รายการ\n` +
      (outgoing || '<i>— ยังไม่มี —</i>') +
      `\n${THIN}\n` +
      `📊 ยอดรับรวม <i>(Total In)</i>  <b>${money(d.totalThb)} THB</b>\n` +
      (d.fixedRate ? `💱 เรตห้อง <i>(Sell Rate)</i>  <b>${money(d.fixedRate)}</b>\n` : '') +
      `${THIN}\n` +
      `🎯 ต้องส่ง <i>(Should Send)</i>  <b>${money(shouldSendUsdt)} USDT</b>\n` +
      `✅ ส่งไปแล้ว <i>(Sent)</i>  <b>${money(d.totalOutgoingUsdt)} USDT</b>\n` +
      `${notSent >= 0 ? '⏳' : '⚠️'} คงเหลือ <i>(Remaining)</i>  <b>${money(notSent)} USDT</b>` +
      (d.fixedRate ? `  <i>(${money(notSentThb)} THB)</i>` : '') +
      `\n${THIN}\n` +
      `💰 กำไรสุทธิ <i>(Net Profit)</i>  <b>${d.netProfitThb >= 0 ? '+' : ''}${money(d.netProfitThb)} THB</b>\n` +
      (d.lastAdminName ? `👤 ผู้รับผิดชอบล่าสุด <i>(Last Staff)</i>  <b>${d.lastAdminName}</b>\n` : '') +
      (d.staff && d.staff.length
        ? `${THIN}\n👷 <b>Top Staff</b>\n` +
          d.staff
            .slice(0, 5)
            .map((s, i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${s.name}  <b>${s.count}</b> ดีล · <b>${s.profitThb >= 0 ? '+' : ''}${money(s.profitThb)} ฿</b>`)
            .join('\n') + '\n'
        : '') +
      `${SIG}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 เริ่มวันใหม่', callback_data: 'newday:1' },
          { text: '🗑 ล้างยอดห้องนี้', callback_data: 'resetask:1' },
        ],
        ...(APP ? [[{ text: '📊 เปิดแดชบอร์ด CE Vault', url: `${APP}/dashboard` }]] : []),
      ],
    },
  };
}

// ═══════════════ เมนูคำสั่ง ═══════════════
export function menuCard(): OutgoingMessage {
  return {
    text:
      `${GRAD_INDIGO}\n` +
      `${MARK} <b>CE VAULT</b>  <i>· เมนูคำสั่ง</i>\n` +
      `${THIN}\n` +
      `<b>ทำรายการ</b>\n` +
      `📸 ส่ง<b>สลิป THB</b> → ส่งสกรีนช็อต USDT (หรือพิมพ์ยอด) → ยืนยัน\n` +
      `${THIN}\n` +
      `<b>พิมพ์ยอด (ต้องระบุสกุลเสมอ)</b>\n` +
      FORMAT_HINT + `\n` +
      `${THIN}\n` +
      `<b>คำสั่ง</b>\n` +
      `📊 <code>/today</code>  ยอดห้องนี้วันนี้\n` +
      `🔄 <code>/newday</code>  เริ่มวันใหม่\n` +
      `🗑 <code>/reset</code>  ล้างยอดห้องนี้\n` +
      `🏷 <code>/setrate 40</code>  ตั้งเรตขายห้องนี้\n` +
      `💱 <code>/rate</code>  เรตตลาด Binance\n` +
      `🏦 <code>/receiver 6578</code>  ประวัติผู้รับ\n` +
      `✖️ <code>/cancel</code>  ยกเลิกรายการค้าง\n` +
      `${SIG}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 ยอดวันนี้', callback_data: 'menu_today:1' },
          { text: '🔄 เริ่มวันใหม่', callback_data: 'newday:1' },
        ],
        ...(APP ? [[{ text: '📊 แดชบอร์ด', url: `${APP}/dashboard` }]] : []),
      ],
    },
  };
}

// ═══════════════ Reset (hard) ═══════════════
export function resetAsk(roomName?: string | null): OutgoingMessage {
  return {
    text:
      `${GRAD_RED}\n` +
      `🗑 <b>ล้างยอดห้องนี้${roomName ? ` · ${roomName}` : ''}?</b>\n` +
      `${THIN}\n` +
      `<b>ลบธุรกรรมทั้งหมดของห้องนี้ถาวร</b> (ย้อนกลับไม่ได้)\n` +
      `<i>ห้องอื่นไม่กระทบ · ประวัติผู้รับยังอยู่</i>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚠️ ยืนยันล้าง', callback_data: 'resetgo:1' },
          { text: '✖️ ไม่ล้าง', callback_data: 'cancelop:1' },
        ],
      ],
    },
  };
}
export function resetDone(count: number): OutgoingMessage {
  return {
    text:
      `${GRAD_GREEN}\n` +
      `✅ <b>ล้างยอดห้องนี้แล้ว</b>\n` +
      `${THIN}\n` +
      `ลบไป <b>${count} รายการ</b> · ยอดเริ่มนับใหม่จาก 0\n` +
      `${SIG}`,
  };
}

/** ยืนยันตั้งชื่อห้อง */
export function roomNameSet(name: string): OutgoingMessage {
  return {
    text:
      `${GRAD_GREEN}\n` +
      `✅ <b>ตั้งชื่อห้องแล้ว</b>\n` +
      `${THIN}\n` +
      `🏠 ห้องนี้คือ  <b>${name}</b>\n` +
      `<i>แสดงในแดชบอร์ด/สรุปแทนเลขห้อง</i>`,
  };
}

/** ยืนยันเริ่มวันใหม่ (day-cut) */
export function newDayStarted(atLabel: string): OutgoingMessage {
  return {
    text:
      `${GRAD_INDIGO}\n` +
      `🔄 <b>เริ่มวันใหม่แล้ว</b>\n` +
      `${THIN}\n` +
      `<i>ยอดสรุปเริ่มนับใหม่ตั้งแต่</i>  <b>${atLabel}</b>\n` +
      `<i>ยอดก่อนหน้ายังอยู่ในแดชบอร์ด/ประวัติครบ</i>\n` +
      `${SIG}`,
  };
}

// ═══════════════ Receiver History ═══════════════
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
  lastAt?: string | null;   // ISO
  lastRef?: string | null;
  todayCount?: number;
  todayThb?: number;
}

const fmtDT = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('th-TH', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
      })
    : '-';

/** บรรทัดสรุปผู้รับ แทรกในการ์ดสลิป: เคยรับแล้ว n รายการ / บัญชีใหม่ */
export function receiverBrief(r: ReceiverCardData | null, bank: string | null, last4: string): string {
  if (!r) {
    return (
      `${THIN}\n` +
      `⚠️ <b>บัญชีใหม่</b> <i>(New Receiver)</i>  ${bank ?? '-'} <code>••••${last4}</code>\n` +
      `<i>ยังไม่เคยมีประวัติในระบบ</i>`
    );
  }
  const star = r.status === 'trusted' ? '  ⭐ <b>Trusted</b>' : r.status === 'blacklist' ? '  🚫 <b>BLACKLIST</b>' : '';
  return (
    `${THIN}\n` +
    `🏦 <b>${r.bank ?? '-'} ••••${r.last4}</b>${r.name ? `  👤 ${r.name}` : ''}${star}\n` +
    `📊 เคยรับแล้ว <i>(History)</i>  <b>${r.totalTx ?? 0} รายการ</b> · รวม <b>${money(r.totalThb ?? 0)} THB</b>\n` +
    (r.todayCount ? `📅 วันนี้ <i>(Today)</i>  <b>${r.todayCount} รายการ</b> · <b>${money(r.todayThb ?? 0)} THB</b>\n` : '') +
    `⏱ ล่าสุด <i>(Last)</i>  ${fmtDT(r.lastAt)}${r.lastRef ? `  <code>#${r.lastRef}</code>` : ''}`
  );
}

/** การ์ดเต็มสำหรับ /receiver 6578 */
export function receiverCard(r: ReceiverCardData): OutgoingMessage {
  const star = r.status === 'trusted' ? '⭐ Trusted Receiver' : r.status === 'blacklist' ? '🚫 BLACKLIST' : '';
  const avg = r.totalTx ? (r.totalThb ?? 0) / r.totalTx : 0;
  return {
    text:
      `${GRAD_INDIGO}\n` +
      `${BRAND}  <i>· Receiver</i>\n${THIN}\n` +
      `🏦 <b>${r.bank ?? '-'}</b>  <code>••••${r.last4}</code>\n` +
      (r.name ? `👤 <b>${r.name}</b>\n` : '') +
      (star ? `${star}\n` : '') +
      table(
        [
          ['Deals', String(r.totalTx ?? 0)],
          ['Total', money(r.totalThb ?? 0)],
          ['Max', money(r.maxThb ?? 0)],
          ['Last', money(r.lastThb ?? 0)],
          ['USDT', money(r.totalUsdt ?? 0)],
          ['Avg', money(avg)],
        ],
        17,
      ) +
      `⏱ ล่าสุด <i>(Last)</i>  ${fmtDT(r.lastAt)}\n` +
      (r.lastRef ? `🧾 <code>#${r.lastRef}</code>\n` : '') +
      `${SIG}`,
  };
}

export function receiverNotFound(last4: string): OutgoingMessage {
  return {
    text: `${MARK} ไม่พบประวัติผู้รับ <code>••••${last4}</code>\n<i>บัญชีนี้ยังไม่เคยมีธุรกรรมในระบบ</i>`,
  };
}

// ═══════════════ Error ═══════════════
export function error(detail: string): OutgoingMessage {
  return {
    text:
      `${GRAD_RED}\n` +
      `⚠️ <b>ทำรายการไม่สำเร็จ</b>\n` +
      `${GRAD_RED}\n` +
      `<code>${detail}</code>\n` +
      `<i>ลองใหม่อีกครั้ง หรือแจ้งแอดมินระบบ</i>`,
  };
}
