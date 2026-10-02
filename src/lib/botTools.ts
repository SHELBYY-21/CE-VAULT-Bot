// ============================================================
// เกณฑ์แสดงผลข้อมูลจริงของบอท (เวลา · ลูกค้า · ยอดบช · ยอดรวม · USDT)
// ใช้ประกอบการ์ด /today — ไม่ใช่เมนูรีพอร์ตแยก
// ============================================================
import { getRoom } from './botSessions';
import {
  getTodayLedger,
  getRecentPairs,
  getAdminByTelegramId,
  getDefaultBankAccountId,
} from './transactions';
import {
  bangkokNowLabel,
  listPinnedBanksForToday,
  last4OfAccount,
  type BankAccount,
} from './banks';
import { createSupabaseAdminClient } from './supabase/admin';

export type LiveToolsSnapshot = {
  nowLabel: string;
  roomName: string | null;
  adminName: string | null;
  adminHoldingUsdt: number | null;
  lastCustomer: {
    name: string | null;
    bank: string | null;
    last4: string | null;
    thb: number;
    at: string;
  } | null;
  /** บัญชีรับที่เซ็ตวันนี้ (สูงสุด 3) */
  pinnedBanks: { bank_name: string; last4: string; balance: number }[];
  /** ใบแรก / default — backward compat */
  bank: BankAccount | null;
  bankLast4: string | null;
  totalThb: number;
  totalIncomingUsdt: number;
  totalOutgoingUsdt: number;
  shouldSendUsdt: number;
  remainingUsdt: number;
  netProfitThb: number;
  recent: { time: string; thb: number; usdt: number; gapMin: number | null }[];
};

export async function getLiveToolsSnapshot(opts: {
  chatId: number;
  adminTelegramId?: number | null;
}): Promise<LiveToolsSnapshot> {
  const room = await getRoom(opts.chatId);
  const [led, recent, pinnedList, admin] = await Promise.all([
    getTodayLedger(room.dayCutAt, opts.chatId),
    getRecentPairs(opts.chatId, room.dayCutAt, 5),
    listPinnedBanksForToday(),
    opts.adminTelegramId ? getAdminByTelegramId(opts.adminTelegramId) : Promise.resolve(null),
  ]);

  let bank: BankAccount | null = pinnedList[0] ?? null;
  if (!bank) {
    const id = await getDefaultBankAccountId();
    if (id) {
      const { data, error } = await createSupabaseAdminClient()
        .from('bank_accounts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        const d = data as Record<string, any>;
        bank = {
          id: String(d.id),
          label: String(d.label || ''),
          bank_name: String(d.bank_name || ''),
          account_number: d.account_number != null ? String(d.account_number) : null,
          current_balance: Number(d.current_balance || 0),
          pinned_for_date: d.pinned_for_date != null ? String(d.pinned_for_date) : null,
        };
      }
    }
  }

  const rate = room.rate;
  const shouldSendUsdt = rate ? led.totalThb / rate : led.totalIncomingUsdt;
  const remainingUsdt = shouldSendUsdt - led.totalOutgoingUsdt;

  let lastCustomer: LiveToolsSnapshot['lastCustomer'] = null;
  try {
    let row: Record<string, any> | null = null;
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from('transactions')
        .select('receiver_name,receiver_bank,receiver_last4,thb_amount,created_at')
        .eq('chat_id', opts.chatId)
        .eq('type', 'THB_DEPOSIT')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      row = !error && data ? (data as Record<string, any>) : null;
    } catch {
      row = null;
    }
    if (row) {
      lastCustomer = {
        name: row.receiver_name != null ? String(row.receiver_name) : null,
        bank: row.receiver_bank != null ? String(row.receiver_bank) : null,
        last4: row.receiver_last4 != null ? String(row.receiver_last4) : null,
        thb: Number(row.thb_amount || 0),
        at: String(row.created_at || ''),
      };
    }
  } catch {
    /* index อาจยังไม่มี */
  }

  return {
    nowLabel: bangkokNowLabel(),
    roomName: room.name,
    adminName: admin?.name ?? led.lastAdminName,
    adminHoldingUsdt: admin ? Number(admin.holding_usdt || 0) : null,
    lastCustomer,
    pinnedBanks: pinnedList.map((b) => ({
      bank_name: b.bank_name,
      last4: last4OfAccount(b.account_number) || '????',
      balance: b.current_balance,
    })),
    bank,
    bankLast4: last4OfAccount(bank?.account_number),
    totalThb: led.totalThb,
    totalIncomingUsdt: led.totalIncomingUsdt,
    totalOutgoingUsdt: led.totalOutgoingUsdt,
    shouldSendUsdt,
    remainingUsdt,
    netProfitThb: led.netProfitThb,
    recent,
  };
}