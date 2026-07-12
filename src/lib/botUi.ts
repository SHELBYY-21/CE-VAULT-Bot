// ============================================================
// CE VAULT — Bot message theme v2 (colorful, animated, distinctive)
// ใช้ HTML + emoji + spoiler + gradient-blocks ให้ดูล้ำสมัยที่สุดในขีดจำกัด Telegram
// ============================================================
import type { OutgoingMessage } from './telegram';

const APP_RAW = (process.env.APP_URL || '').replace(/\/$/, '');
const APP = APP_RAW.startsWith('https://') && !APP_RAW.includes('localhost') ? APP_RAW : '';
const FEE_WARN = Number(process.env.FEE_WARNING_THRESHOLD || 3);

// ═══════════════ Design tokens ═══════════════
const MARK = '⬢';
const BRAND = `${MARK} <b>CE VAULT</b>`;
// เส้นคั่นเดิม
const RULE = '━━━━━━━━━━━━━━━━';
const THIN = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';
// เส้นคั่น "gradient" ด้วยบล็อกสี (ล้ำสมัย)
const GRAD_INDIGO = '🟪🟪🟦🟦🟦🟦🟪🟪';
const GRAD_GOLD   = '🟨🟨🟧🟧🟧🟧🟨🟨';
const GRAD_GREEN  = '🟩🟩🟢🟢🟢🟢🟩🟩';
const GRAD_RED    = '🟥🟥🔴🔴🔴🔴🟥🟥';
const SIG = `<i>${MARK} CE VAULT · secure ledger</i>`;

const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (n: number) => nf.format(Number(n) || 0);
const pct = (n: number) => `${(Number(n) || 0).toFixed(2)}%`;

// สร้างแถบ progress ด้วยบล็อกสี (0..1) — ให้ความรู้สึก "measure"
function bar(value01: number, kind: 'good' | 'bad' = 'good'): string {
  const v = Math.max(0, Math.min(1, value01));
  const filled = Math.round(v * 8);
  const on = kind === 'good' ? '🟩' : '🟥';
  const off = '⬜';
  return on.repeat(filled) + off.repeat(8 - filled);
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
  chatRate?: number | null;      // เรตต่อกลุ่มที่ตั้งไว้
}

export function slipReady(d: SlipReadyData): OutgoingMessage {
  if (d.type === 'USDT_SEND') {
    return {
      text:
        `${GRAD_GOLD}\n${MARK} <b>CE VAULT</b>  ✅ <i>อัปโหลดสลิปสำเร็จ</i>\n${THIN}\n` +
        `🚀 <i>โหมด: ส่ง USDT</i>\nพิมพ์จำนวนที่ส่ง เช่น <code>11</code>`,
    };
  }

  // THB_DEPOSIT — แสดงข้อมูลที่อ่านได้จากสลิปครบชุด
  const rows: string[] = [];
  if (d.date) rows.push(`📅 วันที่ <b>${d.date}</b>` + (d.time ? `  ⏰ <b>${d.time}</b>` : ''));
  else if (d.time) rows.push(`⏰ <b>${d.time}</b>`);
  if (d.thb) rows.push(`💵 ยอดโอน  <b>${money(d.thb)} ฿</b>`);
  if (d.last4) rows.push(`🏦 ปลายทาง  <b>>>${d.last4}</b>` + (d.bank ? `  <i>${d.bank}</i>` : ''));

  const info = rows.length ? rows.join('\n') + `\n${THIN}\n` : '';
  const rateHint = d.chatRate
    ? `<i>เรตห้องนี้ ${money(d.chatRate)} ฿/U → </i><b>ระบบคำนวณให้อัตโนมัติ</b>\n` +
      `กด <code>ยืนยัน</code> หรือพิมพ์ USDT จริงถ้าไม่ตรง`
    : `พิมพ์ <b>USDT ที่ได้จริง</b> เช่น <code>11</code>\n` +
      `<i>หรือ </i><code>THB USDT</code><i> เพื่อระบุเอง</i>`;

  const suggested =
    d.chatRate && d.thb
      ? `\n${THIN}\n🧮 คำนวณ:  <code>${money(d.thb)} ÷ ${money(d.chatRate)} = ${money(d.thb / d.chatRate)} USDT</code>\n`
      : '';

  return {
    text:
      `${GRAD_GREEN}\n` +
      `${MARK} <b>CE VAULT</b>  ✅ <i>วิเคราะห์สลิปเสร็จ</i>  <tg-spoiler>Grok</tg-spoiler>\n` +
      `${GRAD_GREEN}\n` +
      info +
      `💱 <i>โหมด: ฝาก THB → USDT</i>\n${rateHint}${suggested}`,
    reply_markup:
      d.chatRate && d.thb
        ? {
            inline_keyboard: [
              [{ text: `✅ ยืนยัน (${money(d.thb / d.chatRate)} USDT)`, callback_data: `confirm:${(d.thb / d.chatRate).toFixed(2)}` }],
            ],
          }
        : undefined,
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
  // แถบวัดสัดส่วน fee (0..10% เต็มแถบ)
  const feeBar = bar(Math.min(1, d.feePercent / 10), feeHot ? 'bad' : 'good');

  return {
    text:
      `${grad}\n` +
      `${BRAND}  <i>· THB → USDT</i>\n` +
      `${grad}\n` +
      `👤 <b>${d.adminName}</b>   ${tier}\n` +
      `${THIN}\n` +
      `💵 THB    <code>${money(d.thb)}</code>\n` +
      `🪙 USDT   <code>${money(d.usdt)}</code>\n` +
      `${THIN}\n` +
      `${up ? '📈' : '📉'} กำไรสุทธิ   <b>${up ? '+' : ''}${money(d.netProfitThb)} ฿</b>  <i>(${pct(d.profitPercent)})</i>\n` +
      `${feeHot ? '🔴' : '🟢'} ค่าธรรมเนียม   <b>${money(d.feeUsdt)} USDT</b>  <i>(${pct(d.feePercent)})</i>\n` +
      `   ${feeBar}\n` +
      `${THIN}\n` +
      `💼 <i>เหรียญตกค้าง · ${d.adminName}</i>\n` +
      `      <b>${money(d.holdingUsdt)} USDT</b>  🔒\n` +
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
      `${GRAD_GOLD}\n` +
      `👤 <b>${d.adminName}</b>\n` +
      `🚀 ส่งออก   <b>${money(d.usdt)} USDT</b>\n` +
      `${THIN}\n` +
      `💼 <i>เหรียญตกค้างคงเหลือ</i>\n` +
      `      <b>${money(d.holdingUsdt)} USDT</b>  🔒\n` +
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
      `${grad}\n` +
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
