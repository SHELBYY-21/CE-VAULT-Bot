// ============================================================
// Service กลางสำหรับบันทึกธุรกรรม — Supabase (primary, fail-closed)
// Financial write ทุกเส้นทางผ่าน Postgres RPC เพื่อให้แถวธุรกรรม,
// เหรียญตกค้างแอดมิน (holding_usdt) และยอดบัญชีธนาคารเปลี่ยนใน
// Postgres transaction เดียว — error เกิดเมื่อไรยกเลิกทั้งชุด (deny on error)
// ต้องตั้ง DATABASE_PROVIDER=supabase (ดู src/lib/databaseProvider.ts)
// ============================================================
import 'server-only';
import { createSupabaseAdminClient } from './supabase/admin';
import { requireSupabaseProvider } from './databaseProvider';
import { calculateDepositProfit, ProfitResult } from './profit';
import { calculateFee, FeeResult } from './fees';
import { fetchBinanceThUsdtRate } from './binance';
import { assertFiniteRate } from './rateGuard';
import { notifyIncome, notifyOutflow, notifyEdit, notifyDelete } from './notifier';
import type { Admin, TransactionStatus } from '@/types/transactions';
import {
  DEFAULT_TRANSACTION_STATUS,
  normalizeTransactionStatus,
  TRANSACTION_STATUSES,
} from '@/types/transactions';

let cachedRates: { sellRate: number; marketUsdtRate: number; marketSource: MarketSource } | null =
  null;
let ratesCacheTime = 0;
const RATES_CACHE_TTL = 30000;

export class AdminNotFoundError extends Error {
  constructor() {
    super('ADMIN_NOT_FOUND');
    this.name = 'AdminNotFoundError';
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function withId<T>(id: string, data: Record<string, unknown> | null | undefined): (T & { id: string }) | null {
  if (!data) return null;
  return { id, ...data } as T & { id: string };
}

function db() {
  requireSupabaseProvider();
  return createSupabaseAdminClient();
}

function checked(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

type TxRow = Record<string, any> & { id: string };

function rowsFrom(data: unknown): TxRow[] {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((r) => ({ ...(r as Record<string, any>), id: String((r as any).id) }) as TxRow);
}

/** อัปเดตสถานะดีล — ค่าต้องอยู่ในชุด patch-v8 เท่านั้น */
export async function setTransactionStatus(
  txId: string,
  status: TransactionStatus,
): Promise<TransactionStatus> {
  const next = normalizeTransactionStatus(status);
  if (!TRANSACTION_STATUSES.includes(next)) {
    throw new Error('invalid status: ' + String(status));
  }
  const { error } = await db().from('transactions').update({ status: next, updated_at: nowIso() }).eq('id', txId);
  checked(error);
  return next;
}

export async function getAdminByTelegramId(telegramId: number): Promise<Admin | null> {
  const { data, error } = await db()
    .from('admins')
    .select('*')
    .eq('telegram_user_id', telegramId)
    .limit(1);
  checked(error);
  if (!data || data.length === 0) return null;
  return withId<Admin>(String(data[0]!.id), data[0] as Record<string, unknown>);
}

export async function upsertAdmin(telegramId: number, name: string): Promise<Admin> {
  const existing = await getAdminByTelegramId(telegramId);
  if (existing) {
    const { error } = await db().from('admins').update({ name, updated_at: nowIso() }).eq('id', existing.id);
    checked(error);
    return { ...existing, name };
  }
  const row = {
    name,
    telegram_user_id: telegramId,
    holding_usdt: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const { data, error } = await db().from('admins').insert(row).select().single();
  checked(error);
  return withId<Admin>(String((data as any)?.id), data as Record<string, unknown>)!;
}

export type MarketSource = 'binance_th' | 'manual' | 'default';

export async function getLatestRates(): Promise<{
  sellRate: number;
  marketUsdtRate: number;
  marketSource: MarketSource;
}> {
  const now = Date.now();
  if (cachedRates && now - ratesCacheTime < RATES_CACHE_TTL) return cachedRates;

  const [rateRes, live] = await Promise.all([
    db().from('rates').select('*').order('created_at', { ascending: false }).limit(1),
    fetchBinanceThUsdtRate(),
  ]);
  checked(rateRes.error);
  const data = rateRes.data?.[0] ?? null;

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
  const cut = sinceIso && new Date(sinceIso) > midnight ? sinceIso : midnight.toISOString();

  let query = db().from('transactions').select('*').gte('created_at', cut).order('created_at', { ascending: true });
  if (chatId != null) query = query.eq('chat_id', chatId);
  const { data, error } = await query;
  checked(error);
  const rows = rowsFrom(data);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const incomingList = rows
    .filter((r) => r.type === 'THB_DEPOSIT')
    .map((r) => ({
      time: fmt(r.created_at),
      thb: Number(r.thb_amount),
      usdt: Number(r.usdt_amount),
    }));
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

export async function insertRate(
  adminId: string,
  sellRate: number,
  marketUsdtRate: number,
): Promise<void> {
  // Ledger integrity: fail closed on non-finite rates. Number(env) fallbacks are
  // NaN (never null), so a dead `?? default` upstream must not reach the database.
  assertFiniteRate(sellRate, 'sell_rate');
  assertFiniteRate(marketUsdtRate, 'market_usdt_rate');
  const { error } = await db().from('rates').insert({
    sell_rate: sellRate,
    market_usdt_rate: marketUsdtRate,
    set_by_admin_id: adminId,
    created_at: nowIso(),
  });
  checked(error);
}

export async function getDefaultBankAccountId(): Promise<string | null> {
  if (process.env.DEFAULT_BANK_ACCOUNT_ID) return process.env.DEFAULT_BANK_ACCOUNT_ID;
  const { data, error } = await db()
    .from('bank_accounts')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);
  checked(error);
  return data?.[0]?.id ? String(data[0].id) : null;
}

// ─── RPC helpers (หนึ่ง Postgres transaction ต่อการเรียก) ───

async function rpcInsert(
  row: Record<string, unknown>,
  bankDelta: number | null,
  holdingDelta: number | null,
): Promise<{ id: string; holding: number }> {
  const { data, error } = await db().rpc('ce_insert_transaction', {
    p_row: row,
    p_bank_delta: bankDelta,
    p_holding_delta: holdingDelta,
  });
  checked(error);
  const res: any = Array.isArray(data) ? data[0] : data;
  if (!res || res.id == null) throw new Error('ce_insert_transaction returned no id');
  return { id: String(res.id), holding: Number(res.admin_holding ?? 0) };
}

async function rpcEdit(txId: string, patch: Record<string, unknown>): Promise<{ tx: any; holding: number }> {
  const { data, error } = await db().rpc('ce_edit_transaction', { p_tx_id: txId, p_patch: patch });
  checked(error);
  const res: any = Array.isArray(data) ? data[0] : data;
  if (!res || res.tx == null) throw new Error('ce_edit_transaction returned no row');
  return { tx: res.tx, holding: Number(res.admin_holding ?? 0) };
}

async function rpcDelete(txId: string): Promise<{ tx: any; holding: number }> {
  const { data, error } = await db().rpc('ce_delete_transaction', { p_tx_id: txId });
  checked(error);
  const res: any = Array.isArray(data) ? data[0] : data;
  return { tx: res?.tx ?? null, holding: Number(res?.admin_holding ?? 0) };
}

async function getTx(txId: string): Promise<any | null> {
  const { data, error } = await db().from('transactions').select('*').eq('id', txId).maybeSingle();
  checked(error);
  return data ? { ...(data as any), id: String((data as any).id) } : null;
}

/** Supabase Ledger is authoritative; never use display-card or Firestore status to authorize deletion. */
export async function getTransactionStatus(txId: string): Promise<string | null> {
  const tx = await getTx(txId);
  return typeof tx?.status === 'string' ? tx.status : null;
}

function zeroMoneyFields() {
  return {
    thb_amount: 0,
    usdt_amount: 0,
    sell_rate: 0,
    cost_per_unit: 0,
    sell_value_thb: 0,
    net_profit_thb: 0,
    profit_percent: 0,
    expected_usdt: 0,
    fee_usdt: 0,
    fee_percent: 0,
  };
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

  const profit = calculateDepositProfit(input.thbAmount, input.usdtAmount, input.marketUsdtRate);
  const fee = calculateFee(input.thbAmount, input.marketUsdtRate, input.usdtAmount);

  const row = clean({
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
    status: 'waiting_admin',
    admins: { name: admin.name },
    created_at: nowIso(),
  });

  const { id, holding } = await rpcInsert(row, input.thbAmount, input.usdtAmount);
  notifyIncome({ adminName: admin.name, usdt: input.usdtAmount, thb: input.thbAmount }).catch(
    () => undefined,
  );

  return {
    transactionId: id,
    admin: { id: admin.id, name: admin.name, holdingUsdt: holding },
    profit,
    fee,
  };
}

export async function editTransaction(
  txId: string,
  patch: { newThb?: number; newUsdt: number },
): Promise<{ tx: any; admin: { name: string; holdingUsdt: number } }> {
  const old = await getTx(txId);
  if (!old) throw new Error('ไม่พบธุรกรรม');

  if (old.type === 'THB_DEPOSIT') {
    const rates = await getLatestRates();
    const sellRate = Number(old.sell_rate) || rates.sellRate;
    const marketUsdtRate = rates.marketUsdtRate;
    const newThb = patch.newThb ?? Number(old.thb_amount);
    const newUsdt = patch.newUsdt;
    const profit = calculateDepositProfit(newThb, newUsdt, marketUsdtRate);
    const fee = calculateFee(newThb, marketUsdtRate, newUsdt);

    const { holding } = await rpcEdit(txId, {
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
    });
    notifyEdit({ adminName: old.admins?.name ?? '-', note: 'ฝาก THB → USDT' }).catch(
      () => undefined,
    );
    return {
      tx: { ...old, thb_amount: newThb, usdt_amount: newUsdt, ...profit, ...fee },
      admin: { name: old.admins?.name ?? '-', holdingUsdt: holding },
    };
  }

  const newUsdt = patch.newUsdt;
  const { holding } = await rpcEdit(txId, { usdt_amount: newUsdt });
  notifyEdit({ adminName: old.admins?.name ?? '-', note: 'ส่ง USDT' }).catch(() => undefined);
  return {
    tx: { ...old, usdt_amount: newUsdt },
    admin: { name: old.admins?.name ?? '-', holdingUsdt: holding },
  };
}

export async function deleteTransaction(
  txId: string,
): Promise<{ name: string; holdingUsdt: number }> {
  const old = await getTx(txId);
  if (!old) throw new Error('ไม่พบธุรกรรม');
  // Defense in depth: incomplete and unknown statuses must never delete.
  // The SQL RPC re-checks under a row lock to avoid read/delete races.
  if (old.status !== 'completed') throw new Error('TX_NOT_SETTLED');

  const { holding } = await rpcDelete(txId);
  notifyDelete({ adminName: old.admins?.name ?? '-' }).catch(() => undefined);
  return { name: old.admins?.name ?? '-', holdingUsdt: holding };
}

export interface RecordDealInput {
  adminTelegramId: number;
  chatId?: number | null;
  thb: number;
  usdt: number;
  sellRate: number;
  roomName?: string | null;
  ocrConfidence?: number | null;
  ledgerRef: string;
  slipImageUrl?: string | null;
  usdtImageUrl?: string | null;
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
  const profitThb = input.usdt * input.sellRate - input.thb;

  const row = clean({
    ...zeroMoneyFields(),
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
    // ดีลยืนยันแล้ว (มี USDT) — รอแอดมินปิดงาน / Mark Completed
    status: DEFAULT_TRANSACTION_STATUS,
    admins: { name: admin.name },
    created_at: nowIso(),
  });

  // ธนาคาร +1THB ใน Postgres transaction เดียวกับแถวธุรกรรม (RPC ข้ามาถ้าไม่มีบัญชี)
  const { id } = await rpcInsert(row, input.thb, null);
  notifyIncome({ adminName: admin.name, usdt: input.usdt, thb: input.thb }).catch(
    () => undefined,
  );
  return { transactionId: id, adminName: admin.name, buyRate, sellRate: input.sellRate, profitThb };
}

export async function recordIncoming(input: {
  adminTelegramId: number;
  chatId: number;
  thb: number;
  sellRate: number;
  marketRate: number;
  roomName?: string | null;
  ledgerRef: string;
  ocrConfidence?: number | null;
  slipImageUrl?: string | null;
  receiver?: { name?: string | null; bank?: string | null; last4?: string | null } | null;
  bankAccountId?: string | null;
}): Promise<{ transactionId: string; adminName: string; usdtOwed: number; profitThb: number }> {
  const admin = await getAdminByTelegramId(input.adminTelegramId);
  if (!admin) throw new AdminNotFoundError();

  const usdtOwed = input.sellRate > 0 ? input.thb / input.sellRate : 0;
  const profitThb = input.thb - usdtOwed * input.marketRate;
  const bankAccountId = input.bankAccountId ?? (await getDefaultBankAccountId());

  const row = clean({
    ...zeroMoneyFields(),
    admin_id: admin.id,
    bank_account_id: bankAccountId,
    type: 'THB_DEPOSIT',
    thb_amount: input.thb,
    usdt_amount: usdtOwed,
    sell_rate: input.sellRate,
    cost_per_unit: input.marketRate,
    sell_value_thb: input.thb,
    net_profit_thb: profitThb,
    profit_percent: input.thb > 0 ? (profitThb / input.thb) * 100 : 0,
    slip_image_url: input.slipImageUrl ?? '',
    note: input.ledgerRef,
    chat_id: input.chatId,
    buy_rate: input.sellRate,
    room_name: input.roomName ?? null,
    ocr_confidence: input.ocrConfidence ?? null,
    receiver_name: input.receiver?.name ?? null,
    receiver_bank: input.receiver?.bank ?? null,
    receiver_last4: input.receiver?.last4 ?? null,
    ledger_ref: input.ledgerRef,
    // หลัง OCR สลิป THB — ขั้นแรกของ customer status (patch-v8)
    status: 'ocr_success',
    admins: { name: admin.name },
    created_at: nowIso(),
  });

  // fail-closed: ยอดธนาคารปรับใน Postgres transaction เดียวกับแถวธุรกรรม (patch-v10)
  const { id } = await rpcInsert(row, input.thb, null);
  notifyIncome({ adminName: admin.name, usdt: usdtOwed, thb: input.thb }).catch(
    () => undefined,
  );
  return { transactionId: id, adminName: admin.name, usdtOwed, profitThb };
}

export async function recordOutgoing(input: {
  adminTelegramId: number;
  chatId: number;
  usdt: number;
  ledgerRef: string;
  slipImageUrl?: string | null;
  usdtNetwork?: string | null;
  usdtTxid?: string | null;
}): Promise<{ transactionId: string; adminName: string }> {
  const admin = await getAdminByTelegramId(input.adminTelegramId);
  if (!admin) throw new AdminNotFoundError();

  const row = clean({
    ...zeroMoneyFields(),
    admin_id: admin.id,
    type: 'USDT_SEND',
    usdt_amount: input.usdt,
    slip_image_url: input.slipImageUrl ?? '',
    note: input.ledgerRef,
    chat_id: input.chatId,
    ledger_ref: input.ledgerRef,
    usdt_network: input.usdtNetwork ?? null,
    usdt_txid: input.usdtTxid ?? null,
    usdt_image_url: input.slipImageUrl ?? null,
    status: 'waiting_admin',
    admins: { name: admin.name },
    created_at: nowIso(),
  });

  const { id } = await rpcInsert(row, null, null);
  notifyOutflow({ adminName: admin.name, usdt: input.usdt }).catch(() => undefined);
  return { transactionId: id, adminName: admin.name };
}

export interface RecentPair {
  time: string;
  thb: number;
  usdt: number;
  gapMin: number | null;
}
export async function getRecentPairs(
  chatId: number,
  sinceIso?: string | null,
  limit = 5,
): Promise<RecentPair[]> {
  let query = db()
    .from('transactions')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (sinceIso) query = query.gte('created_at', sinceIso);
  const { data, error } = await query;
  checked(error);
  const rows = rowsFrom(data);

  const sends = rows.filter((r) => r.type === 'USDT_SEND');
  const usedSend = new Set<number>();
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    });

  const pairs: RecentPair[] = [];
  for (const inRow of rows.filter((r) => r.type === 'THB_DEPOSIT')) {
    const inTime = new Date(inRow.created_at).getTime();
    const idx = sends.findIndex(
      (s, i) => !usedSend.has(i) && new Date(s.created_at).getTime() >= inTime,
    );
    if (idx >= 0) {
      usedSend.add(idx);
      const sendTime = new Date(sends[idx].created_at).getTime();
      pairs.push({
        time: fmt(inRow.created_at),
        thb: Number(inRow.thb_amount || 0),
        usdt: Number(sends[idx].usdt_amount || 0),
        gapMin: Math.max(0, Math.round((sendTime - inTime) / 60000)),
      });
    } else {
      pairs.push({
        time: fmt(inRow.created_at),
        thb: Number(inRow.thb_amount || 0),
        usdt: Number(inRow.usdt_amount || 0),
        gapMin: null,
      });
    }
  }
  return pairs.slice(-limit).reverse();
}

export async function exportRoomCsv(
  chatId: number,
  sinceIso?: string | null,
): Promise<{ csv: string; rows: number }> {
  let query = db()
    .from('transactions')
    .select('*')
    .eq('type', 'THB_DEPOSIT')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (sinceIso) query = query.gte('created_at', sinceIso);
  const { data, error } = await query;
  checked(error);
  const rows = rowsFrom(data);

  const cols = [
    'ledger_ref',
    'created_at',
    'staff',
    'room_name',
    'thb_amount',
    'usdt_amount',
    'buy_rate',
    'sell_rate',
    'net_profit_thb',
    'receiver_name',
    'receiver_bank',
    'receiver_last4',
    'usdt_network',
    'usdt_txid',
    'ocr_confidence',
  ];
  const cell = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    cols.map((c) => (c === 'staff' ? cell(r.admins?.name) : cell(r[c]))).join(','),
  );
  return { csv: [cols.join(','), ...lines].join('\n'), rows: rows.length };
}

export async function resetRoom(chatId: number): Promise<number> {
  // The old direct DELETE bypassed ce_delete_transaction's settlement guard.
  // Keep a fail-closed API until a separately reviewed archival/day-cut path exists.
  void chatId;
  throw new Error('RESET_ROOM_HARD_DELETE_DISABLED');
}

export interface RoomStat {
  chatId: number | null;
  roomName: string | null;
  txCount: number;
  totalThb: number;
  totalUsdt: number;
  profitThb: number;
}
export async function getRoomLeaderboard(sinceIso?: string | null): Promise<RoomStat[]> {
  let query = db().from('transactions').select('*').eq('type', 'THB_DEPOSIT');
  if (sinceIso) query = query.gte('created_at', sinceIso);
  const { data, error } = await query;
  checked(error);
  const rows = rowsFrom(data);

  const byRoom = new Map<string, RoomStat>();
  for (const r of rows) {
    const key = String(r.chat_id ?? 'unknown');
    const cur = byRoom.get(key) ?? {
      chatId: r.chat_id ?? null,
      roomName: r.room_name ?? null,
      txCount: 0,
      totalThb: 0,
      totalUsdt: 0,
      profitThb: 0,
    };
    cur.txCount += 1;
    cur.totalThb += Number(r.thb_amount || 0);
    cur.totalUsdt += Number(r.usdt_amount || 0);
    cur.profitThb += Number(r.net_profit_thb || 0);
    if (!cur.roomName && r.room_name) cur.roomName = r.room_name;
    byRoom.set(key, cur);
  }
  return [...byRoom.values()].sort((a, b) => b.profitThb - a.profitThb);
}

export interface StaffStat {
  name: string;
  count: number;
  totalThb: number;
  profitThb: number;
}
export async function getStaffLeaderboard(
  sinceIso?: string | null,
  chatId?: number | null,
): Promise<StaffStat[]> {
  let query = db().from('transactions').select('*').eq('type', 'THB_DEPOSIT');
  if (chatId != null) query = query.eq('chat_id', chatId);
  if (sinceIso) query = query.gte('created_at', sinceIso);
  const { data, error } = await query;
  checked(error);
  const rows = rowsFrom(data);

  const map = new Map<string, StaffStat>();
  for (const r of rows) {
    const name = r.admins?.name ?? '-';
    const cur = map.get(name) ?? { name, count: 0, totalThb: 0, profitThb: 0 };
    cur.count += 1;
    cur.totalThb += Number(r.thb_amount || 0);
    cur.profitThb += Number(r.net_profit_thb || 0);
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.profitThb - a.profitThb);
}

export async function getRoomDaySummary(
  chatId: number,
  sinceIso?: string | null,
): Promise<{ ledger: Awaited<ReturnType<typeof getTodayLedger>>; staff: StaffStat[] }> {
  const [ledger, staff] = await Promise.all([
    getTodayLedger(sinceIso, chatId),
    getStaffLeaderboard(sinceIso, chatId),
  ]);
  return { ledger, staff };
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

  const row = clean({
    ...zeroMoneyFields(),
    admin_id: admin.id,
    type: 'USDT_SEND',
    usdt_amount: input.usdtAmount,
    note: input.note ?? '',
    slip_image_url: input.slipImageUrl ?? '',
    status: 'waiting_admin',
    admins: { name: admin.name },
    created_at: nowIso(),
  });

  // หักเหรียญตกค้างแอดมินใน Postgres transaction เดียวกับแถวธุรกรรม (fail พร้อมกัน)
  const { id, holding } = await rpcInsert(row, null, -Math.abs(input.usdtAmount));
  notifyOutflow({ adminName: admin.name, usdt: input.usdtAmount }).catch(() => undefined);

  return {
    transactionId: id,
    admin: { id: admin.id, name: admin.name, holdingUsdt: holding },
  };
}
