// ============================================================
// Interfaces & Types กลางของทั้งโปรเจกต์
// ใช้ร่วมกันทั้งใน Component, API handler และ (คัดลอกบางส่วนไปที่) Bot
// ============================================================

export type TransactionType = 'THB_DEPOSIT' | 'USDT_SEND';
export type TransactionStatus =
  | 'ocr_success'
  | 'waiting_admin'
  | 'completed';
export type OrderStatus = TransactionStatus;

export interface Admin {
  id: string;
  name: string;
  telegram_user_id: number;
  holding_usdt: number;
  created_at?: string;
}

export interface BankAccount {
  id: string;
  label: string;
  bank_name: string;
  account_number?: string | null;
  current_balance: number;
  created_at?: string;
}

export interface Transaction {
  id: string;
  admin_id: string;
  bank_account_id?: string | null;
  type: TransactionType;
  thb_amount: number;
  usdt_amount: number;
  sell_rate: number;
  cost_per_unit: number;
  sell_value_thb: number;
  net_profit_thb: number;
  profit_percent: number;
  expected_usdt: number;
  fee_usdt: number;
  fee_percent: number;
  note?: string | null;
  slip_image_url?: string | null;
  created_at: string;
  updated_at?: string;
  status?: TransactionStatus | null;
  // ความสัมพันธ์ที่ join มาจาก supabase: select('*, admins(name)')
  admins?: { name: string } | null;
}

export interface AverageFeeStats {
  averageFeePercent: number;
  totalTransactions: number;
  totalFeeUsdt: number;
}

// ---- payload ที่ Bot ส่งเข้า API ----
export interface ThbDepositRequest {
  adminTelegramId: number;
  bankAccountId?: string | null;
  thbAmount: number;
  usdtAmount: number;
  sellRate: number;
  marketUsdtRate: number;
  note?: string;
  slipImageUrl?: string;
}

export interface UsdtSendRequest {
  adminTelegramId: number;
  usdtAmount: number;
  note?: string;
  slipImageUrl?: string;
}
