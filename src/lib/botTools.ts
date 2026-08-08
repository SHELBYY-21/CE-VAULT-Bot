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
import { adminDb } from './firebaseAdmin';

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
      const doc = await adminDb.collection('bank_accounts').doc(id).get();
      if (doc.exists) {
        const d = doc.data()!;
        bank = {
          id: doc.id,
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
    let snap;
    try {
      snap = await adminDb
        .collection('transactions')
        .where('chat_id', '==', opts.chatId)
        .where('type', '==', 'THB_DEPOSIT')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
    } catch {
      snap = null;
    }
    if (snap && !snap.empty) {
      const d = snap.docs[0]!.data();
      lastCustomer = {
        name: d.receiver_name != null ? String(d.receiver_name) : null,
        bank: d.receiver_bank != null ? String(d.receiver_bank) : null,
        last4: d.receiver_last4 != null ? String(d.receiver_last4) : null,
        thb: Number(d.thb_amount || 0),
        at: String(d.created_at || ''),
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
