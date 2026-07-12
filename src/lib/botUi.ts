// ============================================================
// CE VAULT — Bot message theme v2 (colorful, animated, distinctive)
// ใช้ HTML + emoji + spoiler + gradient-blocks ให้ดูล้ำสมัยที่สุดในขีดจำกัด Telegram
// ============================================================
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
function refCode(txId: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = (txId || '').replace(/-/g, '').slice(0, 4).toUpperCase() || '----';
  return `CE-${ymd}-${tail}`;
}

// แถบ progress 5 ขั้น: รับสลิป → OCR → รอ USDT → ส่งเหรียญ → เสร็จ
type Step = 1 | 2 | 3 | 4 | 5;
function progress(current: Step): string {
  const steps = ['รับสลิป', 'OCR', 'รอ USDT', 'ส่งเหรียญ', 'เสร็จ'];
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
}

// แสดงความมั่นใจ OCR + สัญญาณเตือน
function confidenceLine(c?: number | null): string {
  if (c == null) return '';
  const dot = c >= 90 ? '🟢' : c >= 75 ? '🟡' : '🔴';
  return `${dot} ความมั่นใจ  <b>${c.toFixed(1)}%</b>`;
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

  // THB_DEPOSIT — การ์ด "OCR สำเร็จ" แบบมืออาชีพ
  const conf = d.confidence ?? null;
  const lowConf = conf != null && conf < 90;
  const header = conf != null && conf < 90 ? '⚠️ <b>ตรวจสอบสลิปอีกครั้ง</b>' : '✅ <b>OCR สำเร็จ</b>';

  const detail: string[] = [];
  if (d.thb != null) detail.push(`💵 ยอดเงิน   <b>${money(d.thb)} บาท</b>`);
  if (d.receiverName) detail.push(`👤 ผู้รับ     <b>${d.receiverName}</b>`);
  if (d.last4 || d.bank)
    detail.push(`🏦 ธนาคาร   <b>${d.bank ?? '-'}</b>${d.last4 ? `  <code>>>${d.last4}</code>` : ''}`);
  if (d.date || d.time) detail.push(`📅 เวลา     <b>${d.date ?? ''} ${d.time ?? ''}</b>`.trimEnd());
  const cLine = confidenceLine(conf);
  if (cLine) detail.push(cLine);

  const canAuto = d.chatRate && d.thb;
  const usdtAuto = canAuto ? d.thb! / d.chatRate! : 0;

  const ask = canAuto
    ? `🧮 <code>${money(d.thb!)} ÷ ${money(d.chatRate!)} = ${money(usdtAuto)} USDT</code>\n` +
      `กดปุ่ม <b>ยืนยัน</b> ด้านล่าง หรือพิมพ์เรตใหม่`
    : `พิมพ์ <b>เรตแลก</b> เช่น <code>36.65</code> → ระบบคำนวณ USDT ให้\n` +
      `<i>(หรือ </i><code>THB เรต</code><i> เพื่อระบุยอดเอง)</i>`;

  return {
    text:
      `${lowConf ? GRAD_RED : GRAD_GREEN}\n` +
      `${MARK} <b>CE VAULT</b>  ${header}  <tg-spoiler>Grok</tg-spoiler>\n` +
      `${progress(2)}\n${THIN}\n` +
      (detail.length ? detail.join('\n') + `\n${THIN}\n` : '') +
      (lowConf ? `<i>ความมั่นใจต่ำกว่า 90% — โปรดตรวจยอดก่อนยืนยัน</i>\n${THIN}\n` : '') +
      ask,
    reply_markup: canAuto
      ? {
          inline_keyboard: [
            [{ text: `✅ ยืนยัน (${money(usdtAuto)} USDT)`, callback_data: `confirm:${usdtAuto.toFixed(2)}` }],
          ],
        }
      : undefined,
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
      `💱 เรตขายของเรา  <b>${money(sell)} ฿ / USDT</b>\n` +
      `🌐 เรตตลาด  <b>${money(market)} ฿ / USDT</b>\n` +
      `      ${src}\n` +
      `${THIN}\n` +
      `📐 ส่วนต่าง (spread)  <b>${money(spread)} ฿</b>  <i>(${pct(spreadPct)})</i>\n` +
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
export function editPrompt(type: 'THB_DEPOSIT' | 'USDT_SEND'): OutgoingMessage {
  const example =
    type === 'USDT_SEND'
      ? 'พิมพ์จำนวน USDT ใหม่ เช่น <code>11</code>'
      : 'พิมพ์ค่าใหม่ — <code>USDT</code> หรือ <code>THB USDT</code>\nเช่น <code>10</code> หรือ <code>5500 10</code>';
  return {
    text:
      `${GRAD_GOLD}\n` +
      `${MARK} <b>CE VAULT</b>  ⚡ <i>โหมดแก้ไข</i>\n` +
      `${GRAD_GOLD}\n${example}\n${THIN}\n` +
      `<i>พิมพ์ </i><code>/cancel</code><i> เพื่อยกเลิก</i>`,
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
      `${MARK} <b>CE VAULT</b>  <i>· ยอดวันนี้</i>\n` +
      `${GRAD_INDIGO}\n` +
      `🟢 <b>เข้าบัญชี</b> (${d.incomingList.length} รายการ)\n` +
      (incoming || '<i>— ยังไม่มี —</i>') +
      `\n${THIN}\n` +
      `🔴 <b>ส่งออก</b> (${d.outgoingList.length} รายการ)\n` +
      (outgoing || '<i>— ยังไม่มี —</i>') +
      `\n${THIN}\n` +
      `📊 ยอดรับรวม        <b>${money(d.totalThb)} ฿</b>\n` +
      (d.fixedRate ? `💱 เรตห้อง              <b>${money(d.fixedRate)}</b>\n` : '') +
      `${THIN}\n` +
      `🎯 ต้องส่ง            <b>${money(shouldSendUsdt)} USDT</b>\n` +
      `✅ ส่งไปแล้ว          <b>${money(d.totalOutgoingUsdt)} USDT</b>\n` +
      `${notSent >= 0 ? '⏳' : '⚠️'} คงเหลือต้องส่ง   <b>${money(notSent)} USDT</b>` +
      (d.fixedRate ? `  <i>(${money(notSentThb)} ฿)</i>` : '') +
      `\n${THIN}\n` +
      `💰 กำไรสุทธิ           <b>${d.netProfitThb >= 0 ? '+' : ''}${money(d.netProfitThb)} ฿</b>\n` +
      (d.lastAdminName ? `👤 ผู้รับผิดชอบล่าสุด  <b>${d.lastAdminName}</b>\n` : '') +
      `${SIG}`,
    reply_markup: APP
      ? { inline_keyboard: [[{ text: '📊 เปิดแดชบอร์ด CE Vault', url: `${APP}/dashboard` }]] }
      : undefined,
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
