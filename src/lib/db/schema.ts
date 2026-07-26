/**
 * CE VAULT Database 2.0 — domain collections
 *
 * Legacy (compat, still primary for reads):
 *   admins, bank_accounts, transactions, rates, receivers,
 *   bot_sessions, chat_settings
 *
 * v2 domains (dual-written; become source of truth over time):
 *   staff, receivers, transactions, ledger_entries, rooms,
 *   daily_rates, ocr_runs, images, audit_logs, wallets,
 *   settlements, analytics_daily
 */

export const DB2 = {
  staff: 'staff',
  receivers: 'receivers',
  transactions: 'transactions',
  ledger: 'ledger_entries',
  rooms: 'rooms',
  dailyRates: 'daily_rates',
  ocr: 'ocr_runs',
  images: 'images',
  audit: 'audit_logs',
  wallets: 'wallets',
  settlements: 'settlements',
  analytics: 'analytics_daily',
  // legacy aliases (still written)
  admins: 'admins',
  bankAccounts: 'bank_accounts',
  rates: 'rates',
  chatSettings: 'chat_settings',
  botSessions: 'bot_sessions',
} as const;

export type Db2Collection = (typeof DB2)[keyof typeof DB2];

/** All v2 domain collections (for verify / rules) */
export const DB2_DOMAINS = [
  DB2.staff,
  DB2.receivers,
  DB2.transactions,
  DB2.ledger,
  DB2.rooms,
  DB2.dailyRates,
  DB2.ocr,
  DB2.images,
  DB2.audit,
  DB2.wallets,
  DB2.settlements,
  DB2.analytics,
] as const;

export type StaffRole = 'owner' | 'admin' | 'operator' | 'viewer';

export interface StaffDoc {
  display_name: string;
  telegram_user_id: number;
  role: StaffRole;
  active: boolean;
  /** @deprecated prefer wallets — mirrored for compat */
  holding_usdt: number;
  legacy_admin_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiverDoc {
  account_hash: string;
  bank: string | null;
  receiver_name: string | null;
  account_last4: string;
  total_transactions: number;
  total_amount_thb: number;
  total_usdt: number;
  max_amount_thb: number;
  last_amount_thb: number;
  first_transaction_at: string | null;
  last_transaction_at: string | null;
  last_ledger_ref: string | null;
  status: 'normal' | 'trusted' | 'blacklist';
  schema_version: 2;
}

export interface RoomDoc {
  chat_id: number;
  name: string | null;
  fixed_rate: number | null;
  day_cut_at: string | null;
  schema_version: 2;
  updated_at: string;
}

export interface DailyRateDoc {
  sell_rate: number;
  market_usdt_rate: number;
  source: 'binance_th' | 'manual' | 'default';
  set_by_staff_id: string | null;
  valid_from: string;
  schema_version: 2;
  created_at: string;
}

export type LedgerAccountKind = 'staff_usdt' | 'bank_thb' | 'wallet_usdt';

export interface LedgerEntryDoc {
  account_kind: LedgerAccountKind;
  account_id: string;
  delta: number;
  balance_after: number | null;
  tx_id: string | null;
  ledger_ref: string | null;
  reason: string;
  room_id: string | null;
  staff_id: string | null;
  schema_version: 2;
  created_at: string;
}

export interface OcrRunDoc {
  tx_id: string | null;
  session_key: string | null;
  engine: 'grok' | 'ocr_space' | 'manual' | 'unknown';
  thb: number | null;
  bank: string | null;
  last4: string | null;
  receiver_name: string | null;
  confidence: number | null;
  /** Authenticity — true = Yes (fail), false = No (pass) */
  forged: boolean;
  edited: boolean;
  duplicate: boolean;
  fingerprint: string | null;
  image_id: string | null;
  raw_summary: string | null;
  schema_version: 2;
  created_at: string;
}

export type ImageKind = 'thb_slip' | 'usdt_proof' | 'other';

export interface ImageDoc {
  kind: ImageKind;
  storage_path: string | null;
  url: string;
  tx_id: string | null;
  ocr_run_id: string | null;
  schema_version: 2;
  created_at: string;
}

export interface AuditLogDoc {
  actor_staff_id: string | null;
  actor_telegram_id: number | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  room_id: string | null;
  schema_version: 2;
  created_at: string;
}

export type WalletOwnerType = 'staff' | 'room' | 'system';

export interface WalletDoc {
  owner_type: WalletOwnerType;
  owner_id: string;
  asset: 'USDT' | 'THB';
  balance: number;
  external_ref: string | null;
  schema_version: 2;
  updated_at: string;
}

export type SettlementStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface SettlementDoc {
  tx_id: string;
  amount_usdt: number;
  network: string | null;
  chain_txid: string | null;
  image_id: string | null;
  status: SettlementStatus;
  staff_id: string | null;
  schema_version: 2;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsDailyDoc {
  room_id: string; // String(chatId) or 'global'
  date: string; // YYYY-MM-DD Bangkok
  total_thb_in: number;
  total_usdt_in: number;
  total_usdt_out: number;
  net_profit_thb: number;
  deal_count: number;
  by_staff: Record<string, { count: number; profit_thb: number }>;
  schema_version: 2;
  updated_at: string;
}

export const SCHEMA_VERSION = 2 as const;
