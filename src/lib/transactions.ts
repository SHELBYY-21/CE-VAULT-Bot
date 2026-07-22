// ============================================================
// Service กลางสำหรับบันทึกธุรกรรม — Firestore (Firebase)
// ============================================================
import { randomUUID } from 'crypto';
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { calculateDepositProfit, ProfitResult } from './profit';
import { calculateFee, FeeResult } from './fees';
import { fetchBinanceThUsdtRate } from './binance';
import { notifyIncome, notifyOutflow, notifyEdit, notifyDelete } from './notifier';
import type { Admin, TransactionStatus } from '@/types/transactions';
import {
  DEFAULT_TRANSACTION_STATUS,
  normalizeTransactionStatus,
  TRANSACTION_STATUSES,
} from '@/types/transactions';

let cachedRates: { sellRate: number; marketUsdtRate: number; marketSource: MarketSource } | null = null;
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

function withId<T>(id: string, data: DocumentData | undefined): (T & { id: string }) | null {
  if (!data) return null;
  return { id, ...data } as T & { id: string };
}

/** อัปเดตสถานะดีล — ค่าต้องอยู่ในชุด patch-v8 เท่านั้น */
export async function setTransactionStatus(
  txId: string,
  status: TransactionStatus,
): Promise<TransactionStatus> {
  const next = normalizeTransactionStatus(status);
  if (!TRANSACTION_STATUSES.includes(next)) {
    throw new Error(`invalid status: ${status}`);
  }
  await adminDb.collection('transactions').doc(txId).update({
    status: next,
    updated_at: nowIso(),
  });
  return next;
}

/** Firestore FAILED_PRECONDITION when a composite index is missing */
export function isFirestoreIndexError(e: unknown): boolean {
  const any = e as { code?: number | string; message?: string };
  const msg = String(any?.message ?? e ?? '');
  return (
    any?.code === 9 ||
    any?.code === 'failed-precondition' ||
    msg.includes('FAILED_PRECONDITION') ||
    msg.includes('requires an index')
  );
}

type TxRow = Record<string, any> & { id: string };

/**
 * โหลดธุรกรรมของห้อง โดยไม่พึ่ง composite index
 * (where chat_id == X ใช้ single-field อัตโนมัติ แล้ว filter/sort ในหน่วยความจำ)
 * — แก้เคสบอทพังด้วย "The query requires an index"
 */
async function loadRoomTransactions(
  chatId: number,
  opts?: {
    sinceIso?: string | null;
    type?: string | null;
    order?: 'asc' | 'desc';
    limit?: number;
  },
): Promise<TxRow[]> {
  const snap = await adminDb.collection('transactions').where('chat_id', '==', chatId).get();
  let rows: TxRow[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (opts?.sinceIso) {
    const cut = opts.sinceIso;
    rows = rows.filter((r) => String(r.created_at || '') >= cut);
  }
  if (opts?.type) {
    rows = rows.filter((r) => r.type === opts.type);
  }
  const dir = opts?.order === 'desc' ? -1 : 1;
  rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * dir);
  if (opts?.limit != null && opts.limit >= 0) rows = rows.slice(0, opts.limit);
  return rows;
}

/**
 * พยายามใช้ query ที่มี index ก่อน — ถ้า index ยังไม่พร้อม ถอยไป single-field + memory
 */
async function runTxQuery(
  build: () => Query,
  fallback: () => Promise<TxRow[]>,
): Promise<TxRow[]> {
  try {
    const snap = await build().get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (!isFirestoreIndexError(e)) throw e;
    console.warn('[firestore] missing index — using in-memory fallback:', (e as Error)?.message?.slice(0, 120));
    return fallback();
  }
}

export async function getAdminByTelegramId(telegramId: number): Promise<Admin | null> {
  const snap = await adminDb
    .collection('admins')
    .where('telegram_user_id', '==', telegramId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return withId<Admin>(doc.id, doc.data());
}

export async function upsertAdmin(telegramId: number, name: string): Promise<Admin> {
  const existing = await getAdminByTelegramId(telegramId);
  if (existing) {
    await adminDb.collection('admins').doc(existing.id).update({ name, updated_at: nowIso() });
    return { ...existing, name };
  }
  const id = randomUUID();
  const row = {
    name,
    telegram_user_id: telegramId,
    holding_usdt: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await adminDb.collection('admins').doc(id).set(row);
  return { id, ...row };
}

export type MarketSource = 'binance_th' | 'manual' | 'default';

export async function getLatestRates(): Promise<{
  sellRate: number;
  marketUsdtRate: number;
  marketSource: MarketSource;
}> {
  const now = Date.now();
  if (cachedRates && now - ratesCacheTime < RATES_CACHE_TTL) return cachedRates;

  const [rateSnap, live] = await Promise.all([
    adminDb.collection('rates').orderBy('created_at', 'desc').limit(1).get(),
    fetchBinanceThUsdtRate(),
  ]);
  const data = rateSnap.empty ? null : rateSnap.docs[0]!.data();

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

  let rows: TxRow[];
  if (chatId != null) {
    rows = await runTxQuery(
      () =>
        adminDb
          .collection('transactions')
          .where('chat_id', '==', chatId)
          .where('created_at', '>=', cut)
          .orderBy('created_at', 'asc'),
      () => loadRoomTransactions(chatId, { sinceIso: cut, order: 'asc' }),
    );
  } else {
    rows = await runTxQuery(
      () =>
        adminDb
          .collection('transactions')
          .where('created_at', '>=', cut)
          .orderBy('created_at', 'asc'),
      async () => {
        const snap = await adminDb.collection('transactions').get();
        return snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as TxRow)
          .filter((r) => String(r.created_at || '') >= cut)
          .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
      },
    );
  }

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

export async function insertRate(
  adminId: string,
  sellRate: number,
  marketUsdtRate: number,
): Promise<void> {
  await adminDb.collection('rates').doc(randomUUID()).set({
    sell_rate: sellRate,
    market_usdt_rate: marketUsdtRate,
    set_by_admin_id: adminId,
    created_at: nowIso(),
  });
}

export async function getDefaultBankAccountId(): Promise<string | null> {
  if (process.env.DEFAULT_BANK_ACCOUNT_ID) return process.env.DEFAULT_BANK_ACCOUNT_ID;
  const snap = await adminDb.collection('bank_accounts').orderBy('created_at', 'asc').limit(1).get();
  return snap.empty ? null : snap.docs[0]!.id;
}

async function addAdminHolding(adminId: string, delta: number): Promise<number> {
  const ref = adminDb.collection('admins').doc(adminId);
  return adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const next = Number(doc.data()?.holding_usdt || 0) + delta;
    tx.update(ref, { holding_usdt: next, updated_at: nowIso() });
    return next;
  });
}

async function addBankBalance(bankId: string, delta: number): Promise<number> {
  const ref = adminDb.collection('bank_accounts').doc(bankId);
  return adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const next = Number(doc.data()?.current_balance || 0) + delta;
    tx.update(ref, { current_balance: next, updated_at: nowIso() });
    return next;
  });
}

async function getTx(txId: string): Promise<any | null> {
  const doc = await adminDb.collection('transactions').doc(txId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
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
  const id = randomUUID();
  const ts = nowIso();

  await adminDb
    .collection('transactions')
    .doc(id)
    .set(
      clean({
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
        created_at: ts,
        updated_at: ts,
      }),
    );

  if (input.bankAccountId) await addBankBalance(input.bankAccountId, input.thbAmount);
  const newHolding = await addAdminHolding(admin.id, input.usdtAmount);
  notifyIncome({ adminName: admin.name, usdt: input.usdtAmount, thb: input.thbAmount }).catch(() => undefined);

  return {
    transactionId: id,
    admin: { id: admin.id, name: admin.name, holdingUsdt: newHolding },
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

    await adminDb
      .collection('transactions')
      .doc(txId)
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
        updated_at: nowIso(),
      });

    const holdingDelta = newUsdt - Number(old.usdt_amount);
    const thbDelta = newThb - Number(old.thb_amount);
    const newHolding = await addAdminHolding(old.admin_id, holdingDelta);
    if (old.bank_account_id) await addBankBalance(old.bank_account_id, thbDelta);
    notifyEdit({ adminName: old.admins?.name ?? '-', note: 'ฝาก THB → USDT' }).catch(() => undefined);

    return {
      tx: { ...old, thb_amount: newThb, usdt_amount: newUsdt, ...profit, ...fee },
      admin: { name: old.admins?.name ?? '-', holdingUsdt: newHolding },
    };
  }

  const newUsdt = patch.newUsdt;
  await adminDb.collection('transactions').doc(txId).update({
    usdt_amount: newUsdt,
    updated_at: nowIso(),
  });
  const delta = -(newUsdt - Number(old.usdt_amount));
  const newHolding = await addAdminHolding(old.admin_id, delta);
  notifyEdit({ adminName: old.admins?.name ?? '-', note: 'ส่ง USDT' }).catch(() => undefined);
  return {
    tx: { ...old, usdt_amount: newUsdt },
    admin: { name: old.admins?.name ?? '-', holdingUsdt: newHolding },
  };
}

export async function deleteTransaction(txId: string): Promise<{ name: string; holdingUsdt: number }> {
  const old = await getTx(txId);
  if (!old) throw new Error('ไม่พบธุรกรรม');

  const delta = old.type === 'THB_DEPOSIT' ? -Number(old.usdt_amount) : Number(old.usdt_amount);
  const newHolding = await addAdminHolding(old.admin_id, delta);
  if (old.type === 'THB_DEPOSIT' && old.bank_account_id) {
    await addBankBalance(old.bank_account_id, -Number(old.thb_amount));
  }
  await adminDb.collection('transactions').doc(txId).delete();
  notifyDelete({ adminName: old.admins?.name ?? '-' }).catch(() => undefined);
  return { name: old.admins?.name ?? '-', holdingUsdt: newHolding };
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
  const id = randomUUID();
  const ts = nowIso();

  await adminDb
    .collection('transactions')
    .doc(id)
    .set(
      clean({
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
        created_at: ts,
        updated_at: ts,
      }),
    );

  if (input.bankAccountId) await addBankBalance(input.bankAccountId, input.thb);
  notifyIncome({ adminName: admin.name, usdt: input.usdt, thb: input.thb }).catch(() => undefined);
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
}): Promise<{ transactionId: string; adminName: string; usdtOwed: number; profitThb: number }> {
  const admin = await getAdminByTelegramId(input.adminTelegramId);
  if (!admin) throw new AdminNotFoundError();

  const usdtOwed = input.sellRate > 0 ? input.thb / input.sellRate : 0;
  const profitThb = input.thb - usdtOwed * input.marketRate;
  const id = randomUUID();
  const ts = nowIso();

  await adminDb
    .collection('transactions')
    .doc(id)
    .set(
      clean({
        ...zeroMoneyFields(),
        admin_id: admin.id,
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
        created_at: ts,
        updated_at: ts,
      }),
    );

  notifyIncome({ adminName: admin.name, usdt: usdtOwed, thb: input.thb }).catch(() => undefined);
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
  const id = randomUUID();
  const ts = nowIso();

  await adminDb
    .collection('transactions')
    .doc(id)
    .set(
      clean({
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
        created_at: ts,
        updated_at: ts,
      }),
    );

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
  const rows = await runTxQuery(
    () => {
      let q: Query = adminDb
        .collection('transactions')
        .where('chat_id', '==', chatId)
        .orderBy('created_at', 'asc');
      if (sinceIso) {
        q = adminDb
          .collection('transactions')
          .where('chat_id', '==', chatId)
          .where('created_at', '>=', sinceIso)
          .orderBy('created_at', 'asc');
      }
      return q;
    },
    () => loadRoomTransactions(chatId, { sinceIso, order: 'asc' }),
  );

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
    const idx = sends.findIndex((s, i) => !usedSend.has(i) && new Date(s.created_at).getTime() >= inTime);
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
  const rows = await runTxQuery(
    () => {
      let q: Query = adminDb
        .collection('transactions')
        .where('type', '==', 'THB_DEPOSIT')
        .where('chat_id', '==', chatId)
        .orderBy('created_at', 'desc')
        .limit(5000);
      if (sinceIso) {
        q = adminDb
          .collection('transactions')
          .where('type', '==', 'THB_DEPOSIT')
          .where('chat_id', '==', chatId)
          .where('created_at', '>=', sinceIso)
          .orderBy('created_at', 'desc')
          .limit(5000);
      }
      return q;
    },
    () =>
      loadRoomTransactions(chatId, {
        sinceIso,
        type: 'THB_DEPOSIT',
        order: 'desc',
        limit: 5000,
      }),
  );
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
  const lines = rows.map((r) => cols.map((c) => (c === 'staff' ? cell(r.admins?.name) : cell(r[c]))).join(','));
  return { csv: [cols.join(','), ...lines].join('\n'), rows: rows.length };
}

export async function resetRoom(chatId: number): Promise<number> {
  const snap = await adminDb.collection('transactions').where('chat_id', '==', chatId).get();
  const batchSize = 400;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = adminDb.batch();
    for (const d of snap.docs.slice(i, i + batchSize)) batch.delete(d.ref);
    await batch.commit();
    deleted += Math.min(batchSize, snap.docs.length - i);
  }
  return deleted;
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
  let q: Query = adminDb.collection('transactions').where('type', '==', 'THB_DEPOSIT');
  if (sinceIso) {
    q = adminDb
      .collection('transactions')
      .where('type', '==', 'THB_DEPOSIT')
      .where('created_at', '>=', sinceIso);
  }
  const snap = await q.get();
  const rows = snap.docs.map((d) => d.data()) as any[];
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
  let rows: TxRow[];
  if (chatId != null) {
    rows = await runTxQuery(
      () => {
        let q: Query = adminDb
          .collection('transactions')
          .where('type', '==', 'THB_DEPOSIT')
          .where('chat_id', '==', chatId);
        if (sinceIso) {
          q = adminDb
            .collection('transactions')
            .where('type', '==', 'THB_DEPOSIT')
            .where('chat_id', '==', chatId)
            .where('created_at', '>=', sinceIso);
        }
        return q;
      },
      () =>
        loadRoomTransactions(chatId, {
          sinceIso,
          type: 'THB_DEPOSIT',
          order: 'asc',
        }),
    );
  } else {
    rows = await runTxQuery(
      () => {
        let q: Query = adminDb.collection('transactions').where('type', '==', 'THB_DEPOSIT');
        if (sinceIso) {
          q = adminDb
            .collection('transactions')
            .where('type', '==', 'THB_DEPOSIT')
            .where('created_at', '>=', sinceIso);
        }
        return q;
      },
      async () => {
        const snap = await adminDb.collection('transactions').where('type', '==', 'THB_DEPOSIT').get();
        let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TxRow);
        if (sinceIso) list = list.filter((r) => String(r.created_at || '') >= sinceIso);
        return list;
      },
    );
  }
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
  const id = randomUUID();
  const ts = nowIso();

  await adminDb
    .collection('transactions')
    .doc(id)
    .set(
      clean({
        ...zeroMoneyFields(),
        admin_id: admin.id,
        type: 'USDT_SEND',
        usdt_amount: input.usdtAmount,
        note: input.note ?? '',
        slip_image_url: input.slipImageUrl ?? '',
        status: 'waiting_admin',
        admins: { name: admin.name },
        created_at: ts,
        updated_at: ts,
      }),
    );

  const newHolding = await addAdminHolding(admin.id, -Math.abs(input.usdtAmount));
  notifyOutflow({ adminName: admin.name, usdt: input.usdtAmount }).catch(() => undefined);

  return {
    transactionId: id,
    admin: { id: admin.id, name: admin.name, holdingUsdt: newHolding },
  };
}
