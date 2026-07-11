// ============================================================
// CEempire — บอทแจ้งเตือน (โพสต์ไปกลุ่มที่ตั้งใน NOTIFY_CHAT_ID)
// โทน: กระชับ มั่นใจ เป็นระบบแต่เป็นมิตร ใช้อีโมจิเล็กน้อย
// ใช้ bot token เดียวกับ CE Vault (คนละ chat)
// ============================================================
import { supabaseAdmin } from './supabaseAdmin';

const TOKEN = process.env.BOT_TOKEN || '';
const CHAT_ID = process.env.NOTIFY_CHAT_ID || ''; // เว้นว่าง = ปิดแจ้งเตือน

const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (n: number) => nf.format(Number(n) || 0);

async function post(text: string): Promise<void> {
  if (!TOKEN || !CHAT_ID) return; // ปิดใช้งานเงียบๆ ถ้ายังไม่ตั้ง env
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn(`notifier post failed (${res.status}): ${text.slice(0, 50)}`);
    }
  } catch (e) {
    console.warn('notifier post error:', e instanceof Error ? e.message : e);
  }
}

/** ยอดรวม holding USDT ปัจจุบันของทุกแอดมิน (ใช้เป็น "ยอดบัญชีรวม") */
async function totalHoldingUsdt(): Promise<number> {
  const { data } = await supabaseAdmin.from('admins').select('holding_usdt');
  return (data ?? []).reduce((s, a: any) => s + Number(a.holding_usdt || 0), 0);
}

// ─── รายรับเข้า (ฝาก THB → ได้ USDT) ───
export async function notifyIncome(input: {
  adminName: string;
  usdt: number;
  thb: number;
}): Promise<void> {
  const total = await totalHoldingUsdt();
  await post(
    `📈 <b>ระบบอัปเดตแล้วครับ</b>\n` +
      `รายรับใหม่  <b>+${money(input.usdt)} USDT</b>  <i>(${money(input.thb)} ฿)</i>\n` +
      `ยอดรวมปัจจุบัน <b>${money(total)} USDT</b>\n` +
      `<i>โดย ${input.adminName}</i>`,
  );
}

// ─── รายจ่ายออก (ส่ง USDT ให้ทุนจีน) ───
export async function notifyOutflow(input: {
  adminName: string;
  usdt: number;
}): Promise<void> {
  const total = await totalHoldingUsdt();
  await post(
    `💸 <b>บัญชีถูกหักค่าใช้จ่าย</b>  <b>${money(input.usdt)} USDT</b>\n` +
      `ยอดคงเหลือ  <b>${money(total)} USDT</b>\n` +
      `<i>โดย ${input.adminName}</i>`,
  );
}

// ─── แก้ไข ───
export async function notifyEdit(input: { adminName: string; note?: string }): Promise<void> {
  const total = await totalHoldingUsdt();
  await post(
    `✏️ <b>อัปเดตธุรกรรมแล้ว</b>${input.note ? ` <i>· ${input.note}</i>` : ''}\n` +
      `ยอดรวมปัจจุบัน <b>${money(total)} USDT</b>\n` +
      `<i>โดย ${input.adminName}</i>`,
  );
}

// ─── ลบ ───
export async function notifyDelete(input: { adminName: string }): Promise<void> {
  const total = await totalHoldingUsdt();
  await post(
    `🗑 <b>ธุรกรรมถูกยกเลิก</b>\n` +
      `ยอดรวมปัจจุบัน <b>${money(total)} USDT</b>\n` +
      `<i>โดย ${input.adminName}</i>`,
  );
}

// ─── สรุปรายวัน (ยอด incoming/outgoing วันนี้) ───
export async function notifyDailySummary(): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from('transactions')
    .select('type, thb_amount, usdt_amount, net_profit_thb')
    .gte('created_at', startOfDay.toISOString());

  const rows = data ?? [];
  const income = rows
    .filter((r: any) => r.type === 'THB_DEPOSIT')
    .reduce((s, r: any) => s + Number(r.thb_amount || 0), 0);
  const outflowUsdt = rows
    .filter((r: any) => r.type === 'USDT_SEND')
    .reduce((s, r: any) => s + Number(r.usdt_amount || 0), 0);
  const netProfit = rows
    .filter((r: any) => r.type === 'THB_DEPOSIT')
    .reduce((s, r: any) => s + Number(r.net_profit_thb || 0), 0);
  const sign = netProfit >= 0 ? '+' : '';

  await post(
    `🗓 <b>สรุปวันนี้</b>\n` +
      `รายรับ  <b>${money(income)} ฿</b>\n` +
      `ส่งออก  <b>${money(outflowUsdt)} USDT</b>\n` +
      `กำไรสุทธิ  <b>${sign}${money(netProfit)} ฿</b>\n` +
      `<i>ธุรกรรมทั้งหมด ${rows.length} รายการ</i>`,
  );
}

// ─── สถานะระบบ (เรียกตอนบูต / /ping ในกลุ่มแจ้งเตือน) ───
export async function notifyReady(): Promise<void> {
  await post(`⚡ <b>CEempire</b> พร้อมแล้วครับ ข้อมูลบัญชีทั้งหมดอัปเดตเรียบร้อย`);
}
