// ============================================================
// Service กลางสำหรับบันทึกธุรกรรม — ใช้ร่วมกันทั้ง API route และ Telegram webhook
// ============================================================
import { supabaseAdmin } from './supabaseAdmin';
import { calculateProfit, calculateDepositProfit, ProfitResult } from './profit';
import { calculateFee, FeeResult } from './fees';
import { fetchBinanceThUsdtRate } from './binance';
import { notifyIncome, notifyOutflow, notifyEdit, notifyDelete } from './notifier';
import type { Admin } from '@/types/transactions';

// ─── RATE CACHE (30s) เพื่อลด Binance API calls ───
let cachedRates: { sellRate: number; marketUsdtRate: number; marketSource: MarketSource } | null = null;
let ratesCacheTime = 0;
const RATES_CACHE_TTL = 30000; // 30 วินาที

export class AdminNotFoundError extends Error {
  constructor() {
    super('ADMIN_NOT_FOUND');
    this.name = 'AdminNotFoundError';
  }
}

export async function getAdminByTelegramId(telegramId: number): Promise<Admin | null> {
  const { data } = await supabaseAdmin
    .from('admins')
    .select('*')
    .eq('telegram_user_id', telegramId)
    .maybeSingle();
  return (data as Admin) ?? null;
}

/** ลงทะเบียน/อัปเดตชื่อแอดมินจาก Telegram (auto-register: ทุกคนในกลุ่มใช้ได้) */
export async function upsertAdmin(telegramId: number, name: string): Promise<Admin> {
  const { data, error } = await supabaseAdmin
    .from('admins')
    .upsert(
      { telegram_user_id: telegramId, name },
      { onConflict: 'telegram_user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as Admin;
}

export type MarketSource = 'binance_th' | 'manual' | 'default';

/**
 * เรตที่ใช้คำนวณ:
 * - sellRate       = เรตขายของเรา (แอดมินตั้งผ่าน /rate → ตาราง rates → ENV)
 * - marketUsdtRate = เรตตลาดจริง อ้างอิง Binance TH real-time (fallback: rates → ENV)
 */
export async function getLatestRates(): Promise<{
  sellRate: number;
  marketUsdtRate: number;
  marketSource: MarketSource;
}> {
  const now = Date.now();
  if (cachedRates && now - ratesCacheTime < RATES_CACHE_TTL) {
    return cachedRates; // จาก cache ตอบเลย
  }

  // ยิง DB + Binance พร้อมกัน (เดิม sequential เสียเวลา ~300-800ms ทุกธุรกรรม)
  const [{ data }, live] = await Promise.all([
    supabaseAdmin
      .from('rates')
      .select('sell_rate, market_usdt_rate')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchBinanceThUsdtRate(),
  ]);

  const sellRate = Number(data?.sell_rate) || Number(process.env.DEFAULT_SELL_RATE) || 35.5;
  let marketUsdtRate: number;
  let marketSource: MarketSource;
  if (live) {
    marketUsdtRate = live;
    marketSource = 'binance_th';
  } else if (data?.market_usdt_rate) {
    marketUsdtRate = Number(data.market_usdt_rate);
    marketSource = 'manual';
  } else {
    marketUsdtRate = Number(process.env.DEFAULT_MARKET_RATE) || 34.8;
    marketSource = 'default';
  }

  const result = { sellRate, marketUsdtRate, marketSource };
  cachedRates = result;
  ratesCacheTime = now;
  return result;
}

/** ดึง ledger รายวัน (ทั้งระบบ) — ใช้กับคำสั่ง /ยอด และ /summary */
export async function getTodayLedger(
  sinceIso?: string | null,
  chatId?: number | null,
): Promise<{
  incomingList: { time: string; thb: number; usdt: number }[];
  outgoingList: { time: string; usdt: number }[];
  totalThb: number;
  totalIncomingUsdt: number;
  totalOutgoingUsdt: number;
  netProfitThb: number;
  lastAdminName: string | null;
}> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  // นับจากจุดที่ช้ากว่า: เที่ยงคืน หรือ จุดตัดวันที่ตั้งเอง (เริ่มวันใหม่)
  const cut = sinceIso && new Date(sinceIso) > midnight ? sinceIso : midnight.toISOString();
  let q = supabaseAdmin
    .from('transactions')
    .select('created_at, type, thb_amount, usdt_amount, net_profit_thb, admins(name)')
    .gte('created_at', cut)
    .order('created_at', { ascending: true });
  if (chatId != null) q = q.eq('chat_id', chatId); // แยกห้อง
  const { data } = await q;

  const rows = (data ?? []) as any[];
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  const incomingList = rows
    .filter((r) => r.type === 'THB_DEPOSIT')
    .map((r) => ({ time: fmt(r.created_at), thb: Number(r.thb_amount), usdt: Number(r.usdt_amount) }));
  const outgoingList = rows
    .filter((r) => r.type === 'USDT_SEND')
    .map((r) => ({ time: fmt(r.created_at), usdt: Number(r.usdt_amount) }));
  const totalThb = incomingList.reduce((s, r) => s + r.thb, 0);
  const totalIncomingUsdt = incomingList.reduce((s, r) => s + r.usdt, 0);
  const totalOutgoingUsdt = outgoingList.reduce((s, r) => s + r.usdt, 0);
  const netProfitThb = rows
    .filter((r) => r.type === 'THB_DEPOSIT')
    .reduce((s, r) => s + Number(r.net_profit_thb || 0), 0);
  const last = rows[rows.length - 1];
  return {
    incomingList,
    outgoingList,
    totalThb,
    totalIncomingUsdt,
    totalOutgoingUsdt,
    netProfitThb,
    lastAdminName: last?.admins?.name ?? null,
  };
}

/** ตั้งเรตใหม่ (บันทึกลงตาราง rates พร้อมผู้ตั้ง) */
export async function insertRate(
  adminId: string,
  sellRate: number,
  marketUsdtRate: number,
): Promise<void> {
  const { error } = await supabaseAdmin.from('rates').insert({
    sell_rate: sellRate,
    market_usdt_rate: marketUsdtRate,
    set_by_admin_id: adminId,
  });
  if (error) throw error;
}

/** เลือกบัญชีธนาคารเริ่มต้น: ENV > บัญชีแรกในตาราง */
export async function getDefaultBankAccountId(): Promise<string | null> {
  if (process.env.DEFAULT_BANK_ACCOUNT_ID) return process.env.DEFAULT_BANK_ACCOUNT_ID;
  const { data } = await supabaseAdmin
    .from('bank_accounts')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// อัปเดตยอดแบบ read-modify-write (ไม่พึ่ง RPC — ทำงานได้ทุกโปรเจกต์)
async function addAdminHolding(adminId: string, delta: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from('admins')
    .select('holding_usdt')
    .eq('id', adminId)
    .single();
  const next = Number(data?.holding_usdt || 0) + delta;
  await supabaseAdmin.from('admins').update({ holding_usdt: next }).eq('id', adminId);
  return next;
}

async function addBankBalance(bankId: string, delta: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from('bank_accounts')
    .select('current_balance')
    .eq('id', bankId)
    .single();
  const next = Number(data?.current_balance || 0) + delta;
  await supabaseAdmin.from('bank_accounts').update({ current_balance: next }).eq('id', bankId);
  return next;
}

export interface RecordThbInput {
  adminTelegramId: number;
  bankAccountId?: string | null;
  thbAmount: number;
  usdtAmount: number;
  sellRate: number;
  marketUsdtRate: number;
  note?: string;
  slipImageUrl?: string;
}
export interface ThbResult {
  transactionId: string;
  admin: { id: string; name: string; holdingUsdt: number };
  profit: ProfitResult;
  fee: FeeResult;
}

export async function recordThbDeposit(input: RecordThbInput): Promise<ThbResult> {
  const admin = await getAdminByTelegramId(input.adminTelegramId);
  if (!admin) throw new AdminNotFoundError();

  // โมเดลฝาก: กำไร = THB − usdt×เรตตลาด, ค่าธรรมเนียม = ส่วนต่าง USDT (มูลค่าตลาด − ที่ส่งจริง)
  const profit = calculateDepositProfit(input.thbAmount, input.usdtAmount, input.marketUsdtRate);
  const fee = calculateFee(input.thbAmount, input.marketUsdtRate, input.usdtAmount);

  const { data: tx, error: txErr } = await supabaseAdmin
    .from('transactions')
    .insert({
      admin_id: admin.id,
      bank_account_id: input.bankAccountId ?? null,
      type: 'THB_DEPOSIT',
      thb_amount: input.thbAmount,
      usdt_amount: input.usdtAmount,
      sell_rate: input.sellRate,
      cost_per_unit: profit.costPerUnit,
      sell_value_thb: profit.sellValueThb,
      net_profit_thb: profit.netProfitThb,
      profit_percent: profit.profitPercent,
      expected_usdt: fee.expectedUsdt,
      fee_usdt: fee.feeUsdt,
      fee_percent: fee.feePercent,
      note: input.note ?? '',
      slip_image_url: input.slipImageUrl ?? '',
    })
    .select('id')
    .single();
  if (txErr || !tx) throw txErr ?? new Error('INSERT_FAILED');

  if (input.bankAccountId) {
    await addBankBalance(input.bankAccountId, input.thbAmount);
  }
  const newHolding = await addAdminHolding(admin.id, input.usdtAmount);

  // แจ้งเตือนกลุ่ม CEempire (fire-and-forget)
  notifyIncome({ adminName: admin.name, usdt: input.usdtAmount, thb: input.thbAmount }).catch(() => undefined);

  return {
    transactionId: tx.id,
    admin: { id: admin.id, name: admin.name, holdingUsdt: newHolding },
    profit,
    fee,
  };
}

/**
 * แก้ไขธุรกรรมที่บันทึกไปแล้ว — คำนวณ delta เทียบของเดิมแล้วปรับ holding/bank balance ให้ถูกต้อง
 * newThb + newUsdt ใช้กับ THB_DEPOSIT / newUsdt อย่างเดียวสำหรับ USDT_SEND
 */
export async function editTransaction(
  txId: string,
  patch: { newThb?: number; newUsdt: number },
): Promise<{ tx: any; admin: { name: string; holdingUsdt: number } }> {
  const { data: old } = await supabaseAdmin
    .from('transactions')
    .select('*, admins(name)')
    .eq('id', txId)
    .single();
  if (!old) throw new Error('ไม่พบธุรกรรม');

  if (old.type === 'THB_DEPOSIT') {
    const rates = await getLatestRates();
    const sellRate = Number(old.sell_rate) || rates.sellRate;
    const marketUsdtRate = rates.marketUsdtRate;
    const newThb = patch.newThb ?? Number(old.thb_amount);
    const newUsdt = patch.newUsdt;

    const profit = calculateDepositProfit(newThb, newUsdt, marketUsdtRate);
    const fee = calculateFee(newThb, marketUsdtRate, newUsdt);

    await supabaseAdmin
      .from('transactions')
      .update({
        thb_amount: newThb,
        usdt_amount: newUsdt,
        sell_rate: sellRate,
        cost_per_unit: profit.costPerUnit,
        sell_value_thb: profit.sellValueThb,
        net_profit_thb: profit.netProfitThb,
        profit_percent: profit.profitPercent,
        expected_usdt: fee.expectedUsdt,
        fee_usdt: fee.feeUsdt,
        fee_percent: fee.feePercent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', txId);

    const holdingDelta = newUsdt - Number(old.usdt_amount);
    const thbDelta = newThb - Number(old.thb_amount);
    const newHolding = await addAdminHolding(old.admin_id, holdingDelta);
    if (old.bank_account_id) await addBankBalance(old.bank_account_id, thbDelta);

    notifyEdit({ adminName: old.admins?.name ?? '-', note: 'ฝาก THB → USDT' }).catch(() => undefined);

    return {
      tx: { ...old, thb_amount: newThb, usdt_amount: newUsdt, ...profit, ...fee },
      admin: { name: old.admins?.name ?? '-', holdingUsdt: newHolding },
    };
  } else {
    // USDT_SEND: หัก holding ตอน insert → -old, ตอนแก้ต้องบวก old กลับก่อนแล้วหัก new
    const newUsdt = patch.newUsdt;
    await supabaseAdmin
      .from('transactions')
      .update({ usdt_amount: newUsdt, updated_at: new Date().toISOString() })
      .eq('id', txId);
    const delta = -(newUsdt - Number(old.usdt_amount)); // เดิม -oldUsdt, ใหม่ -newUsdt → net = old - new
    const newHolding = await addAdminHolding(old.admin_id, delta);

    notifyEdit({ adminName: old.admins?.name ?? '-', note: 'ส่ง USDT' }).catch(() => undefined);

    return {
      tx: { ...old, usdt_amount: newUsdt },
      admin: { name: old.admins?.name ?? '-', holdingUsdt: newHolding },
    };
  }
}

/** ลบธุรกรรม (คืน holding/bank balance ให้ถูกต้อง) */
export async function deleteTransaction(txId: string): Promise<{ name: string; holdingUsdt: number }> {
  const { data: old } = await supabaseAdmin
    .from('transactions')
    .select('*, admins(name)')
    .eq('id', txId)
    .single();
  if (!old) throw new Error('ไม่พบธุรกรรม');

  // คืนค่า: THB_DEPOSIT บวกไป holding แล้ว → ต้องหักออก;  USDT_SEND หักไป → ต้องบวกคืน
  const delta = old.type === 'THB_DEPOSIT' ? -Number(old.usdt_amount) : Number(old.usdt_amount);
  const newHolding = await addAdminHolding(old.admin_id, delta);
  if (old.type === 'THB_DEPOSIT' && old.bank_account_id) {
    await addBankBalance(old.bank_account_id, -Number(old.thb_amount));
  }
  await supabaseAdmin.from('transactions').delete().eq('id', txId);

  notifyDelete({ adminName: old.admins?.name ?? '-' }).catch(() => undefined);

  return { name: old.admins?.name ?? '-', holdingUsdt: newHolding };
}

// ============================================================
// Unified Deal (v5): THB slip + USDT confirm ในธุรกรรมเดียว
//   BuyRate = THB / USDT (คำนวณ) · SellRate = เรตห้อง (snapshot)
//   Profit  = USDT × SellRate − THB
// เก็บ type = 'THB_DEPOSIT' เพื่อ backward-compat กับ dashboard เดิม
// ไม่แตะ holding (ดีลนี้ THB เข้า + USDT ออก ในตัวเดียว → net 0)
// ============================================================
export interface RecordDealInput {
  adminTelegramId: number;
  chatId?: number | null;         // ห้อง (กลุ่มเทเลแกรม) ที่ทำรายการ
  thb: number;
  usdt: number;
  sellRate: number;               // เรตห้อง (snapshot)
  roomName?: string | null;
  ocrConfidence?: number | null;
  ledgerRef: string;
  slipImageUrl?: string | null;   // สลิป THB
  usdtImageUrl?: string | null;   // สกรีนช็อต USDT
  usdtNetwork?: string | null;
  usdtTxid?: string | null;
  receiver?: { name?: string | null; bank?: string | null; last4?: string | null } | null;
  bankAccountId?: string | null;
}
export interface DealResult {
  transactionId: string;
  adminName: string;
  buyRate: number;
  sellRate: number;
  profitThb: number;
}

export async function recordDeal(input: RecordDealInput): Promise<DealResult> {
  const admin = await getAdminByTelegramId(input.adminTelegramId);
  if (!admin) throw new AdminNotFoundError();

  const buyRate = input.usdt > 0 ? input.thb / input.usdt : 0;
  const profitThb = input.usdt * input.sellRate - input.thb; // = (sell − buy) × usdt

  // คอลัมน์เสริม (patch-v5/v7) — ถ้ายังไม่ได้รัน migration จะ strip ออกแล้ว retry
  const extra: Record<string, any> = {
    chat_id: input.chatId ?? null,
    buy_rate: buyRate,
    room_name: input.roomName ?? null,
    ocr_confidence: input.ocrConfidence ?? null,
    usdt_network: input.usdtNetwork ?? null,
    usdt_txid: input.usdtTxid ?? null,
    usdt_image_url: input.usdtImageUrl ?? null,
    receiver_name: input.receiver?.name ?? null,
    receiver_bank: input.receiver?.bank ?? null,
    receiver_last4: input.receiver?.last4 ?? null,
    ledger_ref: input.ledgerRef,
  };
  const core = {
    admin_id: admin.id,
    bank_account_id: input.bankAccountId ?? null,
    type: 'THB_DEPOSIT',
    thb_amount: input.thb,
    usdt_amount: input.usdt,
    sell_rate: input.sellRate,
    cost_per_unit: buyRate,
    sell_value_thb: input.usdt * input.sellRate,
    net_profit_thb: profitThb,
    profit_percent: input.thb > 0 ? (profitThb / input.thb) * 100 : 0,
    slip_image_url: input.slipImageUrl ?? '',
    note: input.ledgerRef,
  };

  let tx: { id: string } | null = null;
  {
    const res = await supabaseAdmin.from('transactions').insert({ ...core, ...extra }).select('id').single();
    if (res.error) {
      // migration ยังไม่ครบ → บันทึกเฉพาะคอลัมน์หลัก (ไม่ให้ดีลหาย)
      const res2 = await supabaseAdmin.from('transactions').insert(core).select('id').single();
      if (res2.error || !res2.data) throw res2.error ?? new Error('INSERT_FAILED');
      tx = res2.data;
    } else {
      tx = res.data;
    }
  }
  if (!tx) throw new Error('INSERT_FAILED');

  if (input.bankAccountId) await addBankBalance(input.bankAccountId, input.thb);

  notifyIncome({ adminName: admin.name, usdt: input.usdt, thb: input.thb }).catch(() => undefined);

  return { transactionId: tx.id, adminName: admin.name, buyRate, sellRate: input.sellRate, profitThb };
}

/** ล้างธุรกรรมทั้งหมดของห้องนี้ (hard reset) — คืนจำนวนที่ลบ */
export async function resetRoom(chatId: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from('transactions')
    .delete()
    .eq('chat_id', chatId)
    .select('id');
  return (data ?? []).length;
}

/** สรุปกำไรแยกห้อง (วันนี้ + ทั้งหมด) — ใช้กับ dashboard/leaderboard */
export interface RoomStat {
  chatId: number | null;
  roomName: string | null;
  txCount: number;
  totalThb: number;
  totalUsdt: number;
  profitThb: number;
}
export async function getRoomLeaderboard(sinceIso?: string | null): Promise<RoomStat[]> {
  let q = supabaseAdmin
    .from('transactions')
    .select('chat_id, room_name, thb_amount, usdt_amount, net_profit_thb')
    .eq('type', 'THB_DEPOSIT');
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const byRoom = new Map<string, RoomStat>();
  for (const r of rows) {
    const key = String(r.chat_id ?? 'unknown');
    const cur =
      byRoom.get(key) ??
      { chatId: r.chat_id ?? null, roomName: r.room_name ?? null, txCount: 0, totalThb: 0, totalUsdt: 0, profitThb: 0 };
    cur.txCount += 1;
    cur.totalThb += Number(r.thb_amount || 0);
    cur.totalUsdt += Number(r.usdt_amount || 0);
    cur.profitThb += Number(r.net_profit_thb || 0);
    if (!cur.roomName && r.room_name) cur.roomName = r.room_name;
    byRoom.set(key, cur);
  }
  return [...byRoom.values()].sort((a, b) => b.profitThb - a.profitThb);
}

export interface RecordSendInput {
  adminTelegramId: number;
  usdtAmount: number;
  note?: string;
  slipImageUrl?: string;
}
export interface SendResult {
  transactionId: string;
  admin: { id: string; name: string; holdingUsdt: number };
}

export async function recordUsdtSend(input: RecordSendInput): Promise<SendResult> {
  const admin = await getAdminByTelegramId(input.adminTelegramId);
  if (!admin) throw new AdminNotFoundError();

  const { data: tx, error: txErr } = await supabaseAdmin
    .from('transactions')
    .insert({
      admin_id: admin.id,
      type: 'USDT_SEND',
      usdt_amount: input.usdtAmount,
      note: input.note ?? '',
      slip_image_url: input.slipImageUrl ?? '',
    })
    .select('id')
    .single();
  if (txErr || !tx) throw txErr ?? new Error('INSERT_FAILED');

  const newHolding = await addAdminHolding(admin.id, -Math.abs(input.usdtAmount));

  notifyOutflow({ adminName: admin.name, usdt: input.usdtAmount }).catch(() => undefined);

  return {
    transactionId: tx.id,
    admin: { id: admin.id, name: admin.name, holdingUsdt: newHolding },
  };
}
