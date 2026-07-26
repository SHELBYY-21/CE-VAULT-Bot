/**
 * Database 2.0 dual-write helpers.
 * Never throw into the hot path — log and continue so Telegram webhook stays up.
 */
import { randomUUID } from 'crypto';
import { adminDb } from '../firebaseAdmin';
import {
  DB2,
  SCHEMA_VERSION,
  type AnalyticsDailyDoc,
  type AuditLogDoc,
  type DailyRateDoc,
  type ImageDoc,
  type ImageKind,
  type LedgerAccountKind,
  type LedgerEntryDoc,
  type OcrRunDoc,
  type RoomDoc,
  type SettlementDoc,
  type SettlementStatus,
  type StaffDoc,
  type StaffRole,
  type WalletDoc,
  type WalletOwnerType,
} from './schema';

function nowIso() {
  return new Date().toISOString();
}

function bangkokDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function safeWrite(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`[db2:${label}]`, e instanceof Error ? e.message : e);
  }
}

// ─── Staff (mirrors admins) ─────────────────────────────────
export async function db2UpsertStaff(input: {
  staffId: string;
  telegramUserId?: number;
  displayName?: string;
  role?: StaffRole;
  holdingUsdt?: number;
  legacyAdminId?: string;
}): Promise<void> {
  await safeWrite('staff', async () => {
    const ref = adminDb.collection(DB2.staff).doc(input.staffId);
    const existing = await ref.get();
    const ts = nowIso();
    if (existing.exists) {
      const patch: Record<string, unknown> = { updated_at: ts };
      if (input.displayName) patch.display_name = input.displayName;
      if (input.telegramUserId != null && input.telegramUserId > 0) {
        patch.telegram_user_id = input.telegramUserId;
      }
      if (input.holdingUsdt != null) patch.holding_usdt = input.holdingUsdt;
      if (input.role) patch.role = input.role;
      await ref.update(patch);
      return;
    }
    const row: StaffDoc = {
      display_name: input.displayName || 'Staff',
      telegram_user_id: input.telegramUserId && input.telegramUserId > 0 ? input.telegramUserId : 0,
      role: input.role ?? 'operator',
      active: true,
      holding_usdt: input.holdingUsdt ?? 0,
      legacy_admin_id: input.legacyAdminId ?? input.staffId,
      created_at: ts,
      updated_at: ts,
    };
    await ref.set(row);
  });
}

// ─── Room (mirrors chat_settings) ───────────────────────────
export async function db2UpsertRoom(input: {
  chatId: number;
  name?: string | null;
  fixedRate?: number | null;
  dayCutAt?: string | null;
}): Promise<void> {
  await safeWrite('rooms', async () => {
    const id = String(input.chatId);
    const ref = adminDb.collection(DB2.rooms).doc(id);
    const ts = nowIso();
    const patch: Partial<RoomDoc> & { chat_id: number; schema_version: 2; updated_at: string } = {
      chat_id: input.chatId,
      schema_version: SCHEMA_VERSION,
      updated_at: ts,
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.fixedRate !== undefined) patch.fixed_rate = input.fixedRate;
    if (input.dayCutAt !== undefined) patch.day_cut_at = input.dayCutAt;
    await ref.set(patch, { merge: true });
  });
}

// ─── DailyRate (mirrors rates) ──────────────────────────────
export async function db2InsertDailyRate(input: {
  sellRate: number;
  marketUsdtRate: number;
  source?: DailyRateDoc['source'];
  setByStaffId?: string | null;
}): Promise<void> {
  await safeWrite('daily_rates', async () => {
    const ts = nowIso();
    const row: DailyRateDoc = {
      sell_rate: input.sellRate,
      market_usdt_rate: input.marketUsdtRate,
      source: input.source ?? 'manual',
      set_by_staff_id: input.setByStaffId ?? null,
      valid_from: ts,
      schema_version: SCHEMA_VERSION,
      created_at: ts,
    };
    await adminDb.collection(DB2.dailyRates).doc(randomUUID()).set(row);
  });
}

// ─── Ledger ─────────────────────────────────────────────────
export async function db2AppendLedger(input: {
  accountKind: LedgerAccountKind;
  accountId: string;
  delta: number;
  balanceAfter?: number | null;
  txId?: string | null;
  ledgerRef?: string | null;
  reason: string;
  roomId?: string | null;
  staffId?: string | null;
}): Promise<void> {
  await safeWrite('ledger', async () => {
    const row: LedgerEntryDoc = {
      account_kind: input.accountKind,
      account_id: input.accountId,
      delta: input.delta,
      balance_after: input.balanceAfter ?? null,
      tx_id: input.txId ?? null,
      ledger_ref: input.ledgerRef ?? null,
      reason: input.reason,
      room_id: input.roomId ?? null,
      staff_id: input.staffId ?? null,
      schema_version: SCHEMA_VERSION,
      created_at: nowIso(),
    };
    await adminDb.collection(DB2.ledger).doc(randomUUID()).set(row);
  });
}

// ─── Wallet ─────────────────────────────────────────────────
export async function db2UpsertWallet(input: {
  ownerType: WalletOwnerType;
  ownerId: string;
  asset: 'USDT' | 'THB';
  balance: number;
  externalRef?: string | null;
}): Promise<void> {
  await safeWrite('wallets', async () => {
    const id = `${input.ownerType}_${input.ownerId}_${input.asset}`;
    const row: WalletDoc = {
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      asset: input.asset,
      balance: input.balance,
      external_ref: input.externalRef ?? null,
      schema_version: SCHEMA_VERSION,
      updated_at: nowIso(),
    };
    await adminDb.collection(DB2.wallets).doc(id).set(row, { merge: true });
  });
}

// ─── OCR ────────────────────────────────────────────────────
export async function db2RecordOcr(input: {
  txId?: string | null;
  sessionKey?: string | null;
  engine?: OcrRunDoc['engine'];
  thb?: number | null;
  bank?: string | null;
  last4?: string | null;
  receiverName?: string | null;
  confidence?: number | null;
  imageId?: string | null;
  rawSummary?: string | null;
}): Promise<string | null> {
  let id: string | null = null;
  await safeWrite('ocr', async () => {
    id = randomUUID();
    const row: OcrRunDoc = {
      tx_id: input.txId ?? null,
      session_key: input.sessionKey ?? null,
      engine: input.engine ?? 'unknown',
      thb: input.thb ?? null,
      bank: input.bank ?? null,
      last4: input.last4 ?? null,
      receiver_name: input.receiverName ?? null,
      confidence: input.confidence ?? null,
      image_id: input.imageId ?? null,
      raw_summary: input.rawSummary ?? null,
      schema_version: SCHEMA_VERSION,
      created_at: nowIso(),
    };
    await adminDb.collection(DB2.ocr).doc(id).set(row);
  });
  return id;
}

// ─── Images ─────────────────────────────────────────────────
export async function db2RecordImage(input: {
  kind: ImageKind;
  url: string;
  storagePath?: string | null;
  txId?: string | null;
  ocrRunId?: string | null;
}): Promise<string | null> {
  if (!input.url) return null;
  let id: string | null = null;
  await safeWrite('images', async () => {
    id = randomUUID();
    const row: ImageDoc = {
      kind: input.kind,
      storage_path: input.storagePath ?? null,
      url: input.url,
      tx_id: input.txId ?? null,
      ocr_run_id: input.ocrRunId ?? null,
      schema_version: SCHEMA_VERSION,
      created_at: nowIso(),
    };
    await adminDb.collection(DB2.images).doc(id).set(row);
  });
  return id;
}

// ─── Audit ──────────────────────────────────────────────────
export async function db2Audit(input: {
  action: string;
  entity: string;
  entityId?: string | null;
  actorStaffId?: string | null;
  actorTelegramId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  roomId?: string | null;
}): Promise<void> {
  await safeWrite('audit', async () => {
    const row: AuditLogDoc = {
      actor_staff_id: input.actorStaffId ?? null,
      actor_telegram_id: input.actorTelegramId ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      room_id: input.roomId ?? null,
      schema_version: SCHEMA_VERSION,
      created_at: nowIso(),
    };
    await adminDb.collection(DB2.audit).doc(randomUUID()).set(row);
  });
}

// ─── Settlement ─────────────────────────────────────────────
export async function db2RecordSettlement(input: {
  txId: string;
  amountUsdt: number;
  network?: string | null;
  chainTxid?: string | null;
  imageId?: string | null;
  status?: SettlementStatus;
  staffId?: string | null;
}): Promise<void> {
  await safeWrite('settlements', async () => {
    const ts = nowIso();
    const row: SettlementDoc = {
      tx_id: input.txId,
      amount_usdt: input.amountUsdt,
      network: input.network ?? null,
      chain_txid: input.chainTxid ?? null,
      image_id: input.imageId ?? null,
      status: input.status ?? (input.chainTxid ? 'submitted' : 'pending'),
      staff_id: input.staffId ?? null,
      schema_version: SCHEMA_VERSION,
      created_at: ts,
      updated_at: ts,
    };
    await adminDb.collection(DB2.settlements).doc(randomUUID()).set(row);
  });
}

// ─── Analytics (daily rollup, merge increment) ───────────────
export async function db2BumpAnalytics(input: {
  chatId: number | null;
  thbIn?: number;
  usdtIn?: number;
  usdtOut?: number;
  profitThb?: number;
  dealCount?: number;
  staffName?: string | null;
}): Promise<void> {
  await safeWrite('analytics', async () => {
    const roomId = input.chatId != null ? String(input.chatId) : 'global';
    const date = bangkokDate();
    const id = `${roomId}_${date}`;
    const ref = adminDb.collection(DB2.analytics).doc(id);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = (snap.exists ? snap.data() : null) as AnalyticsDailyDoc | null;
      const byStaff = { ...(cur?.by_staff ?? {}) };
      if (input.staffName) {
        const prev = byStaff[input.staffName] ?? { count: 0, profit_thb: 0 };
        byStaff[input.staffName] = {
          count: prev.count + (input.dealCount ?? 1),
          profit_thb: prev.profit_thb + (input.profitThb ?? 0),
        };
      }
      const next: AnalyticsDailyDoc = {
        room_id: roomId,
        date,
        total_thb_in: (cur?.total_thb_in ?? 0) + (input.thbIn ?? 0),
        total_usdt_in: (cur?.total_usdt_in ?? 0) + (input.usdtIn ?? 0),
        total_usdt_out: (cur?.total_usdt_out ?? 0) + (input.usdtOut ?? 0),
        net_profit_thb: (cur?.net_profit_thb ?? 0) + (input.profitThb ?? 0),
        deal_count: (cur?.deal_count ?? 0) + (input.dealCount ?? 1),
        by_staff: byStaff,
        schema_version: SCHEMA_VERSION,
        updated_at: nowIso(),
      };
      tx.set(ref, next, { merge: true });
    });
  });
}

/**
 * Tag a transaction with schema_version:2 + domain FKs (non-breaking).
 */
export async function db2TagTransaction(
  txId: string,
  patch: {
    staff_id?: string | null;
    room_id?: string | null;
    receiver_id?: string | null;
    ocr_run_id?: string | null;
    image_ids?: string[];
    schema_version?: number;
  },
): Promise<void> {
  await safeWrite('tx_tag', async () => {
    await adminDb
      .collection(DB2.transactions)
      .doc(txId)
      .set(
        {
          ...patch,
          schema_version: patch.schema_version ?? SCHEMA_VERSION,
          updated_at: nowIso(),
        },
        { merge: true },
      );
  });
}
