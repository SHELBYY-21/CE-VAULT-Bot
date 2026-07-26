// ============================================================
// POST /api/telegram/webhook — ตัวรับ update จาก Telegram (รันใน Next.js โปรดักชัน)
// รวม logic ทั้งหมด: onboarding (ถามชื่อ) + อัปโหลดสลิป + บันทึกธุรกรรม + ธีม CE Vault
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import * as UI from '@/lib/botUi';
import {
  sendMessage,
  editMessage,
  sendChatAction,
  answerCallback,
  uploadSlipFromTelegram,
  toPersistedSlipUrl,
  sendSticker,
  type OutgoingMessage,
} from '@/lib/telegram';
import { getSession, setSession, clearSession } from '@/lib/botSessions';
import {
  getAdminByTelegramId,
  upsertAdmin,
  getLatestRates,
  getDefaultBankAccountId,
  insertRate,
  editTransaction,
  deleteTransaction,
  getTodayLedger,
  recordDeal,
  resetRoom,
  getStaffLeaderboard,
  exportRoomCsv,
  recordIncoming,
  recordOutgoing,
  getRecentPairs,
} from '@/lib/transactions';
import { getChatRate, setChatRate, getRoom, startNewDay, setRoomName } from '@/lib/botSessions';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendDocument } from '@/lib/telegram';
import { notifyDailySummary, notifyReady } from '@/lib/notifier';
import { analyzeSlip, analyzeUsdtScreenshot } from '@/lib/ocr';
import { parseAmounts } from '@/lib/amounts';
import { isValidAdminName, parseAdminCommand } from '@/lib/adminName';
import { getReceiver, findReceiversByLast4, upsertReceiverOnDeposit } from '@/lib/receivers';
import { getSticker, validateStickers, type StickerState } from '@/config/stickers';
import {
  bangkokDate,
  bangkokNowLabel,
  listPinnedBanksForToday,
  last4OfAccount,
  findMatchingPinnedBank,
  pinBankForToday,
  unpinPinnedByHint,
  upsertAndPinBank,
  listBankAccounts,
  PinLimitError,
  MAX_PINNED_TODAY,
} from '@/lib/banks';
import { getLiveToolsSnapshot } from '@/lib/botTools';

// ตรวจ USDT (OCR vs พิมพ์เอง) ต้องตรงกันในระดับ 0.0001 (req 13)
const USDT_TOLERANCE = 0.0001;
// OCR มั่นใจ >= ค่านี้ → บันทึกขาเข้าทันที ไม่ต้องถาม
const OCR_AUTO_MIN = Number(process.env.OCR_AUTO_MIN || 90);

// fire-and-forget — ไม่ block flow หลัก ไม่ throw
function sticker(chatId: number, key: StickerState): void {
  const id = getSticker(key);
  if (id) sendSticker(chatId, id).catch(() => undefined);
}

export const runtime = 'nodejs';
export const maxDuration = 30; // request timeout hint (platform-dependent)

// Validate sticker config at cold-start (logs warning, never crashes the webhook)
try {
  validateStickers();
} catch (e: any) {
  console.warn(`[sticker config] ${e.message}`);
}

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET;

const log = (msg: string, data?: any) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, data || '');
};

const parseNums = (s: string): number[] =>
  s
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));

export async function POST(req: NextRequest) {
  // ตรวจ secret จาก Telegram (ตั้งตอน setWebhook)
  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    log('❌ Invalid webhook secret');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const update = await req.json();
    const updateId = update?.update_id || '?';
    log(`📨 incoming update #${updateId}`);

    // Timeout protection: 25s (under maxDuration 30s)
    await Promise.race([
      handleUpdate(update),
      new Promise((_, reject) => setTimeout(() => reject(new Error('WEBHOOK_TIMEOUT')), 25000)),
    ]);
    log(`✅ update #${updateId} processed`);
  } catch (e: any) {
    log(`⚠️ webhook error: ${e?.message || e}`, e?.stack?.slice(0, 200));
  }
  // ตอบ 200 เสมอ เพื่อไม่ให้ Telegram retry ซ้ำ
  return NextResponse.json({ ok: true });
}

async function handleUpdate(update: any): Promise<void> {
  // ----- callback_query จากปุ่ม แก้ไข/ลบ -----
  if (update?.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const msg = update?.message ?? update?.edited_message;
  if (!msg) return;
  const chatId: number = msg.chat?.id;
  const userId: number | undefined = msg.from?.id;
  if (!chatId || !userId) return;
  const text: string | undefined = msg.text?.trim();
  const chatType: string = msg.chat?.type ?? 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  // ----- /summary : สรุปวันนี้ (ส่งไปกลุ่มแจ้งเตือน CEempire) -----
  if (text && text.startsWith('/summary')) {
    await notifyDailySummary();
    return;
  }
  // ----- /ping : เช็คสถานะ CEempire -----
  if (text && text.startsWith('/ping')) {
    await notifyReady();
    return;
  }

  // ----- /receiver <last4> : ดูประวัติผู้รับ -----
  if (text && text.startsWith('/receiver')) {
    const last4 = (text.replace('/receiver', '').trim().match(/\d{4}/) || [])[0];
    if (!last4) {
      await sendMessage(chatId, { text: 'พิมพ์ <code>/receiver 6578</code> (เลขท้ายบัญชี 4 ตัว)' });
      return;
    }
    const found = await findReceiversByLast4(last4);
    if (found.length === 0) {
      await sendMessage(chatId, UI.receiverNotFound(last4));
      return;
    }
    for (const r of found.slice(0, 3)) {
      await sendMessage(
        chatId,
        UI.receiverCard({
          bank: r.bank,
          last4: r.account_last4,
          name: r.receiver_name,
          status: r.status,
          totalTx: r.total_transactions,
          totalThb: Number(r.total_amount_thb),
          totalUsdt: Number(r.total_usdt),
          maxThb: Number(r.max_amount_thb),
          lastThb: Number(r.last_amount_thb),
          lastAt: r.last_transaction_at,
          lastRef: r.last_ledger_ref,
        }),
      );
    }
    return;
  }

  // ----- /cancel : ออกจากโหมดใดๆ -----
  if (text && text.startsWith('/cancel')) {
    await clearSession(chatId, userId);
    await sendMessage(chatId, UI.cancelled());
    return;
  }

  // ----- /setrate <n> : ตั้งเรตแลกของ "ห้องนี้" -----
  if (text && (text.startsWith('/setrate') || text.startsWith('/เรต'))) {
    const nums = parseNums(text.replace('/setrate', '').replace('/เรต', ''));
    if (nums.length >= 1 && nums[0] > 0) {
      await setChatRate(chatId, nums[0]);
      await sendMessage(chatId, UI.chatRateSet(nums[0]));
    } else {
      const cur = await getChatRate(chatId);
      await sendMessage(chatId, UI.chatRateSet(cur ?? 0));
    }
    return;
  }

  // ----- /menu : เมนูคำสั่งทั้งหมด -----
  if (text && text.startsWith('/menu')) {
    await sendMessage(chatId, UI.menuCard());
    return;
  }

  // ----- /tools · /info · /สด : alias ไปยอดวันนี้ (เกณฑ์แสดงผลข้อมูลจริงอยู่ใน ledger) -----
  if (text && (text.startsWith('/tools') || text.startsWith('/info') || text.startsWith('/สด'))) {
    await sendLedger(chatId);
    return;
  }

  // ----- /pin · /unpin : เซ็ตบัญชีรับวันนี้ (สูงสุด 3) -----
  if (text && (text.startsWith('/pin') || text.startsWith('/ปักหมุด'))) {
    await handlePinCommand(chatId, text);
    return;
  }
  if (text && (text.startsWith('/unpin') || text.startsWith('/เลิกปัก'))) {
    await handleUnpinCommand(chatId, text);
    return;
  }

  // ----- /ยอด , /today , /ledger : สรุปยอดห้องนี้วันนี้ (แยกห้อง) -----
  if (
    text &&
    (text.startsWith('/ยอด') ||
      text.startsWith('/today') ||
      text.startsWith('/ledger') ||
      text.startsWith('/สรุป'))
  ) {
    await sendLedger(chatId);
    return;
  }

  // ----- /newday : เริ่มวันใหม่ (day-cut) — โพสต์สรุปวันเก่าก่อน -----
  if (text && text.startsWith('/newday')) {
    await doNewDay(chatId);
    return;
  }

  // ----- /reset : ล้างยอดห้องนี้ (ถามยืนยันก่อน) -----
  if (text && text.startsWith('/reset')) {
    const room = await getRoom(chatId);
    await sendMessage(chatId, UI.resetAsk(room.name));
    return;
  }

  // ----- /setroom <ชื่อ> : ตั้งชื่อห้อง -----
  if (text && (text.startsWith('/setroom') || text.startsWith('/ห้อง'))) {
    const name = text.replace('/setroom', '').replace('/ห้อง', '').trim().slice(0, 40);
    if (!name) {
      await sendMessage(chatId, {
        text: 'พิมพ์ <code>/setroom ห้อง A</code> เพื่อตั้งชื่อห้องนี้',
      });
      return;
    }
    await setRoomName(chatId, name);
    await sendMessage(chatId, UI.roomNameSet(name));
    return;
  }

  // ----- /admin <ชื่อ> : ตั้งชื่อแอดมิน (บังคับใช้คำสั่งนี้เท่านั้น) -----
  if (text && /^\/admin(?:@[\w_]+)?(?:\s|$)/i.test(text)) {
    const parsed = parseAdminCommand(text);
    if (!parsed.matched) return;
    if (!parsed.name) {
      await sendMessage(chatId, UI.adminUsage());
      return;
    }
    if (!isValidAdminName(parsed.name)) {
      await sendMessage(chatId, UI.nameRejected(parsed.name));
      return;
    }
    const created = await upsertAdmin(userId, parsed.name);
    await clearSession(chatId, userId);
    await sendMessage(chatId, UI.registered(created.name));
    sticker(chatId, 'SUCCESS');
    return;
  }

  // ----- /export : ดาวน์โหลด CSV ยอดห้องนี้ (ส่งเป็นไฟล์ในแชต) -----
  if (text && text.startsWith('/export')) {
    const room = await getRoom(chatId);
    // /export all = ทั้งหมด, ไม่งั้นเฉพาะช่วงวันนี้ (จาก day-cut)
    const wantAll = /all|ทั้งหมด/.test(text);
    const { csv, rows } = await exportRoomCsv(chatId, wantAll ? null : room.dayCutAt);
    if (rows === 0) {
      await sendMessage(chatId, { text: 'ยังไม่มีธุรกรรมให้ export' });
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    await sendDocument(
      chatId,
      `ce-vault-${room.name || chatId}-${stamp}.csv`,
      csv,
      `📄 <b>${rows} รายการ</b> · ${room.name || 'ห้องนี้'}${wantAll ? ' (ทั้งหมด)' : ' (วันนี้)'}`,
    );
    return;
  }

  // ----- /start , /help , /register -----
  if (
    text &&
    (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/register'))
  ) {
    const existing = await getAdminByTelegramId(userId);
    if (existing) {
      await clearSession(chatId, userId);
      await sendMessage(chatId, UI.welcomeRegistered(existing.name));
    } else {
      await setSession(chatId, userId, { state: 'AWAITING_NAME' });
      await sendMessage(chatId, UI.askName());
    }
    sticker(chatId, 'WELCOME');
    return;
  }

  const [session, admin] = await Promise.all([
    getSession(chatId, userId),
    getAdminByTelegramId(userId),
  ]);

  // ----- /rate : ดูเรต (ตลาด=Binance TH สด) / ตั้งเรตขาย -----
  if (text && text.startsWith('/rate')) {
    const nums = parseNums(text.replace('/rate', ''));
    const r = await getLatestRates(); // marketUsdtRate = Binance TH real-time
    if (nums.length >= 1) {
      if (!admin) {
        await setSession(chatId, userId, { state: 'AWAITING_NAME' });
        await sendMessage(chatId, UI.askName());
        return;
      }
      const sell = nums[0];
      const market: number = (nums[1] ??
        r.marketUsdtRate ??
        Number(process.env.DEFAULT_MARKET_RATE) ??
        34.8) as number;
      await insertRate(admin.id, sell, market);
      await sendMessage(chatId, UI.rateSet(admin.name, sell, market));
    } else {
      await sendMessage(chatId, UI.rateShow(r.sellRate, r.marketUsdtRate, r.marketSource));
    }
    return;
  }

  // ----- รูปภาพ: Live OCR Card → Confirmation (THB slip / USDT proof) -----
  if (msg.photo) {
    if (!admin) {
      await setSession(chatId, userId, { state: 'AWAITING_NAME' });
      await sendMessage(chatId, UI.askName());
      return;
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    sticker(chatId, 'PROCESSING');
    sendChatAction(chatId, 'upload_photo').catch(() => undefined);

    // Live Card — edit in-place through OCR phases
    let liveId = await sendMessage(chatId, UI.uploading(0));
    try {
      const imgUrl = await uploadSlipFromTelegram(fileId);
      liveId = await liveEdit(chatId, liveId, UI.uploading(1));

      // USDT proof while THB deal is open → Confirmation Card
      if (session?.state === 'WAITING_USDT' && Number(session.ocr_thb) > 0) {
        const u = await analyzeUsdtScreenshot(imgUrl);
        liveId = await liveEdit(chatId, liveId, UI.uploading(2));
        if (u?.amount && u.amount > 0) {
          await presentDealConfirm(
            chatId,
            userId,
            { ...session, live_message_id: liveId },
            u.amount,
            { network: u.network ?? null, txid: u.txid ?? null, imageUrl: imgUrl },
          );
          sticker(chatId, 'OCR_DONE');
          return;
        }
        // Not USDT — fall through and try as new THB slip
      }

      const slip = await analyzeSlip(imgUrl);
      liveId = await liveEdit(chatId, liveId, UI.uploading(2));

      const thbOk = !!slip?.thbAmount && slip.thbAmount > 0;
      const confOk = thbOk && (slip!.confidence == null || slip!.confidence >= OCR_AUTO_MIN);

      if (thbOk) {
        const ledgerRef = session?.ledger_ref || UI.newLedgerRef();
        const pinnedList = await listPinnedBanksForToday();
        const slipHint = {
          bank: slip!.bank ?? null,
          last4: slip!.receiverLast4 ?? null,
          receiverName: slip!.receiverName ?? null,
        };
        const matched = findMatchingPinnedBank(slipHint, pinnedList);
        const room = await getRoom(chatId);
        const rates = await getLatestRates();
        const sellRate = room.rate ?? rates.sellRate;
        const historyLine = await loadReceiverHistoryLine(
          slip!.bank ?? null,
          slip!.receiverLast4 ?? null,
        );

        const baseSession = {
          state: 'WAITING_USDT' as const,
          pending_type: 'THB_DEPOSIT' as const,
          slip_url: imgUrl,
          ocr_thb: slip!.thbAmount ?? null,
          slip_date: slip!.date ?? null,
          slip_time: slip!.time ?? null,
          slip_last4: slip!.receiverLast4 ?? null,
          slip_bank: slip!.bank ?? null,
          slip_receiver_name: slip!.receiverName ?? null,
          ocr_conf: slip!.confidence ?? null,
          ledger_ref: ledgerRef,
          pending_usdt: null,
          usdt_network: null,
          usdt_txid: null,
          usdt_image_url: null,
          admin_id: admin.id,
          admin_name: admin.name,
          live_message_id: liveId,
          pin_matched: !!matched,
        };

        // Pin mismatch warning (still keep deal open for Confirmation)
        if (!matched && pinnedList.length > 0) {
          const first = pinnedList[0]!;
          await setSession(chatId, userId, baseSession);
          await liveEdit(
            chatId,
            liveId,
            UI.slipBankMismatch({
              thb: slip!.thbAmount ?? null,
              bank: slip!.bank,
              last4: slip!.receiverLast4,
              pinBank: first.bank_name,
              pinLast4: last4OfAccount(first.account_number),
              confidence: slip!.confidence,
            }),
          );
          sticker(chatId, 'OCR_DONE');
          return;
        }

        // No pin yet — ask to pin, but still open WAITING_USDT for Confirmation path
        if (!matched && pinnedList.length === 0 && confOk) {
          await setSession(chatId, userId, baseSession);
          await liveEdit(
            chatId,
            liveId,
            UI.slipAskPin({
              thb: slip!.thbAmount!,
              bank: slip!.bank,
              last4: slip!.receiverLast4,
              confidence: slip!.confidence,
            }),
          );
          sticker(chatId, 'OCR_DONE');
          return;
        }

        // Live OCR card → await USDT → Confirmation (Buy Rate = THB÷USDT)
        await setSession(chatId, userId, baseSession);
        await liveEdit(
          chatId,
          liveId,
          UI.waitUsdt({
            thb: slip!.thbAmount,
            bank: slip!.bank,
            last4: slip!.receiverLast4,
            receiverName: slip!.receiverName,
            date: slip!.date,
            time: slip!.time,
            confidence: slip!.confidence,
            ledgerRef,
            historyLine,
            roomRate: sellRate,
            roomName: room.name,
            pinMatched: !!matched,
          }),
        );
        sticker(chatId, 'OCR_DONE');
        return;
      }

      // Not a clear THB slip → try USDT screenshot as standalone OUT
      const u = await analyzeUsdtScreenshot(imgUrl);
      if (u?.amount && u.amount > 0) {
        await liveEdit(chatId, liveId, UI.uploading(3));
        await commitOutgoing(chatId, userId, u.amount, {
          slipUrl: imgUrl,
          network: u.network ?? null,
          txid: u.txid ?? null,
          liveMessageId: liveId,
          ledgerRef: session?.ledger_ref ?? null,
        });
        return;
      }

      const ledgerRef = UI.newLedgerRef();
      await setSession(chatId, userId, {
        state: 'WAITING_USDT',
        pending_type: 'THB_DEPOSIT',
        slip_url: imgUrl,
        ocr_thb: slip?.thbAmount ?? null,
        slip_last4: slip?.receiverLast4 ?? null,
        slip_bank: slip?.bank ?? null,
        slip_receiver_name: slip?.receiverName ?? null,
        ocr_conf: slip?.confidence ?? null,
        ledger_ref: ledgerRef,
        admin_id: admin.id,
        admin_name: admin.name,
        live_message_id: liveId,
      });
      await liveEdit(
        chatId,
        liveId,
        UI.slipUnclear(slip?.thbAmount ?? null, {
          confidence: slip?.confidence ?? null,
          ledgerRef,
        }),
      );
    } catch (e: any) {
      await liveEdit(chatId, liveId, UI.error(e?.message ?? 'upload failed'));
    }
    return;
  }

  // ----- ข้อความตัวอักษร -----
  if (!text) return;

  // (ก) รอชื่อ → ต้องพิมพ์ /admin <ชื่อ> เท่านั้น
  if (session?.state === 'AWAITING_NAME') {
    await sendMessage(chatId, UI.askNameAgain());
    return;
  }

  // (ข.5) กำลังแก้ไขธุรกรรม → อัปเดต tx เดิม (ใช้รูปแบบ +500B / -13.6U เหมือนกัน)
  if (session?.state === 'EDITING' && session.caption) {
    const amt = parseAmounts(text);
    if (!amt.thb && !amt.usdt) {
      return; // ไม่รู้จักรูปแบบ → เงียบ (ไม่ถามกลับ)
    }
    const txId = session.caption; // เก็บ tx_id ไว้ในฟิลด์ caption
    await clearSession(chatId, userId);
    try {
      const oldDoc = await adminDb.collection('transactions').doc(txId).get();
      const old = oldDoc.exists ? oldDoc.data() : null;
      if (!old) throw new Error('ไม่พบธุรกรรมเดิม');

      const newUsdt = amt.usdt ? amt.usdt.value : Number(old.usdt_amount);
      const patch = amt.thb ? { newThb: amt.thb.value, newUsdt } : { newUsdt };
      const r = await editTransaction(txId, patch);
      await sendMessage(
        chatId,
        UI.editSuccess({
          transactionId: txId,
          adminName: r.admin.name,
          type: old.type,
          thb: Number(r.tx.thb_amount),
          usdt: Number(r.tx.usdt_amount),
          netProfitThb: Number(r.tx.netProfitThb ?? r.tx.net_profit_thb),
          profitPercent: Number(r.tx.profitPercent ?? r.tx.profit_percent),
          feeUsdt: Number(r.tx.feeUsdt ?? r.tx.fee_usdt),
          feePercent: Number(r.tx.feePercent ?? r.tx.fee_percent),
          holdingUsdt: r.admin.holdingUsdt,
        }),
      );
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'edit failed'));
    }
    return;
  }

  // (ข) พิมพ์ยอด
  //   +500B -13.6U → Confirmation (Buy Rate = THB÷USDT)
  //   WAITING_USDT + -13.6U → Confirmation
  //   +500B alone → THB shortcut commit
  //   -13.6U alone (no THB session) → OUT shortcut
  {
    const amt = parseAmounts(text);

    // Both legs in one message → Confirmation Card
    if (amt.thb && amt.thb.sign > 0 && amt.usdt && amt.usdt.sign < 0) {
      const ledgerRef = session?.ledger_ref || UI.newLedgerRef();
      const open = {
        ...(session ?? {}),
        state: 'WAITING_USDT' as const,
        pending_type: 'THB_DEPOSIT' as const,
        ocr_thb: amt.thb.value,
        ledger_ref: ledgerRef,
        slip_bank: session?.slip_bank ?? null,
        slip_last4: session?.slip_last4 ?? null,
        slip_receiver_name: session?.slip_receiver_name ?? null,
        ocr_conf: session?.ocr_conf ?? null,
        slip_url: session?.slip_url ?? null,
        live_message_id: session?.live_message_id ?? null,
        admin_id: admin?.id ?? session?.admin_id ?? null,
        admin_name: admin?.name ?? session?.admin_name ?? null,
      };
      await presentDealConfirm(chatId, userId, open, amt.usdt.value, null, amt.thb.value);
      return;
    }

    if (amt.thb && amt.thb.sign > 0) {
      const meta =
        session?.state === 'WAITING_USDT'
          ? {
              slipUrl: session.slip_url ?? null,
              bank: session.slip_bank ?? null,
              last4: session.slip_last4 ?? null,
              receiverName: session.slip_receiver_name ?? null,
              confidence: session.ocr_conf != null ? Number(session.ocr_conf) : null,
              time: session.slip_time ?? null,
              date: session.slip_date ?? null,
              ledgerRef: session.ledger_ref ?? null,
              liveMessageId: session.live_message_id ?? null,
            }
          : {};
      // If deal already has USDT pending, refresh THB and re-show Confirmation
      if (session?.state === 'WAITING_USDT' && Number(session.pending_usdt) > 0) {
        await presentDealConfirm(
          chatId,
          userId,
          { ...session, ocr_thb: amt.thb.value },
          Number(session.pending_usdt),
          session.usdt_image_url
            ? {
                network: session.usdt_network ?? null,
                txid: session.usdt_txid ?? null,
                imageUrl: session.usdt_image_url,
              }
            : null,
          amt.thb.value,
        );
        return;
      }
      if (session?.state === 'WAITING_USDT') await clearSession(chatId, userId);
      try {
        const pinnedList = await listPinnedBanksForToday();
        const matched = findMatchingPinnedBank(
          { bank: meta.bank ?? null, last4: meta.last4 ?? null },
          pinnedList,
        );
        await commitIncoming(chatId, userId, amt.thb.value, {
          ...meta,
          pinMatched: !!matched,
          bankAccountId: matched?.id ?? null,
        });
        sticker(chatId, 'SUCCESS');
      } catch (e: any) {
        await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
      }
      return;
    }

    if (amt.usdt && amt.usdt.sign < 0) {
      // Open THB deal → Confirmation (auto Buy Rate)
      if (session?.state === 'WAITING_USDT' && Number(session.ocr_thb) > 0) {
        await presentDealConfirm(chatId, userId, session, amt.usdt.value, null);
        return;
      }
      try {
        await commitOutgoing(chatId, userId, amt.usdt.value, {
          liveMessageId: session?.live_message_id ?? null,
          ledgerRef: session?.ledger_ref ?? null,
        });
        sticker(chatId, 'SUCCESS');
      } catch (e: any) {
        await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
      }
      return;
    }

    // Bare USDT amount while waiting (e.g. "13.6") → Confirmation
    if (
      session?.state === 'WAITING_USDT' &&
      Number(session.ocr_thb) > 0 &&
      amt.hasBareNumber &&
      !amt.thb &&
      !amt.usdt
    ) {
      const bare = Number(String(text).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)?.[1]);
      if (Number.isFinite(bare) && bare > 0) {
        await presentDealConfirm(chatId, userId, session, bare, null);
        return;
      }
    }

    if (amt.thb || amt.usdt) return;
  }

  // (ค) ไม่มี session — ในแชตส่วนตัวถามชื่ออัตโนมัติ / ในกลุ่มปล่อยผ่าน (กันสแปมคนอื่นในกลุ่ม)
  if (!admin && !isGroup) {
    await setSession(chatId, userId, { state: 'AWAITING_NAME' });
    await sendMessage(chatId, UI.askName());
  }
}

/** Live Card: edit in-place when possible */
async function liveEdit(
  chatId: number,
  messageId: number | null | undefined,
  message: OutgoingMessage,
): Promise<number> {
  if (messageId) {
    await editMessage(chatId, messageId, message);
    return messageId;
  }
  return sendMessage(chatId, message);
}

/** Receiver History line for OCR / Confirm cards (Last4 DB) */
async function loadReceiverHistoryLine(
  bank: string | null,
  last4: string | null,
): Promise<string | null> {
  if (!last4) return null;
  try {
    const exact = await getReceiver(bank, last4);
    if (exact) {
      return UI.receiverBrief(
        {
          bank: exact.bank,
          last4: exact.account_last4,
          name: exact.receiver_name,
          status: exact.status,
          totalTx: exact.total_transactions,
          totalThb: exact.total_amount_thb,
          totalUsdt: exact.total_usdt,
          maxThb: exact.max_amount_thb,
          lastThb: exact.last_amount_thb,
          lastAt: exact.last_transaction_at,
          lastRef: exact.last_ledger_ref,
          todayCount: exact.todayCount,
          todayThb: exact.todayThb,
        },
        bank,
        last4,
      );
    }
    const found = await findReceiversByLast4(last4);
    const r = found[0] ?? null;
    return UI.receiverBrief(
      r
        ? {
            bank: r.bank,
            last4: r.account_last4,
            name: r.receiver_name,
            status: r.status,
            totalTx: r.total_transactions,
            totalThb: r.total_amount_thb,
            totalUsdt: r.total_usdt,
            maxThb: r.max_amount_thb,
            lastThb: r.last_amount_thb,
            lastAt: r.last_transaction_at,
            lastRef: r.last_ledger_ref,
            todayCount: r.todayCount,
            todayThb: r.todayThb,
          }
        : null,
      bank,
      last4,
    );
  } catch {
    return UI.receiverBrief(null, bank, last4);
  }
}

/** บันทึกขาเข้า (รับ THB) ทันที — shortcut เมื่อยังไม่คู่ USDT */
async function commitIncoming(
  chatId: number,
  userId: number,
  thb: number,
  meta: {
    slipUrl?: string | null;
    bank?: string | null;
    last4?: string | null;
    receiverName?: string | null;
    confidence?: number | null;
    time?: string | null;
    date?: string | null;
    pinMatched?: boolean;
    bankAccountId?: string | null;
    ledgerRef?: string | null;
    liveMessageId?: number | null;
  },
): Promise<void> {
  const [room, rates] = await Promise.all([getRoom(chatId), getLatestRates()]);
  const sellRate = room.rate ?? rates.sellRate;
  const ledgerRef = meta.ledgerRef || UI.newLedgerRef();

  const r = await recordIncoming({
    adminTelegramId: userId,
    chatId,
    thb,
    sellRate,
    marketRate: rates.marketUsdtRate,
    roomName: room.name,
    ledgerRef,
    ocrConfidence: meta.confidence ?? null,
    slipImageUrl: meta.slipUrl ?? null,
    receiver: {
      name: meta.receiverName ?? null,
      bank: meta.bank ?? null,
      last4: meta.last4 ?? null,
    },
    bankAccountId: meta.bankAccountId ?? null,
  });

  // Receiver History (fire-and-forget)
  if (meta.last4) {
    upsertReceiverOnDeposit({
      bank: meta.bank ?? null,
      last4: meta.last4,
      receiverName: meta.receiverName ?? null,
      thb,
      usdt: r.usdtOwed,
      ledgerRef,
    })
      .then((rid) => {
        if (rid)
          return adminDb
            .collection('transactions')
            .doc(r.transactionId)
            .update({ receiver_id: rid })
            .then(
              () => undefined,
              () => undefined,
            );
      })
      .catch(() => undefined);
  }

  const recent = await getRecentPairs(chatId, room.dayCutAt, 5).catch(() => []);
  const historyLine = await loadReceiverHistoryLine(meta.bank ?? null, meta.last4 ?? null);

  const card = UI.incomingRecorded({
    transactionId: r.transactionId,
    ledgerRef,
    thb,
    usdtOwed: r.usdtOwed,
    sellRate,
    adminName: r.adminName,
    bank: meta.bank ?? null,
    last4: meta.last4 ?? null,
    confidence: meta.confidence ?? null,
    pinMatched: meta.pinMatched ?? false,
    time: meta.time ?? null,
    date: meta.date ?? null,
    recent,
  });
  // Append receiver history into a follow note via edit/send of same card text
  if (historyLine) card.text += `\n\n${historyLine}`;

  await liveEdit(chatId, meta.liveMessageId, card);
}

/** บันทึกขาออก (ส่ง USDT) ทันที */
async function commitOutgoing(
  chatId: number,
  userId: number,
  usdt: number,
  meta: {
    slipUrl?: string | null;
    network?: string | null;
    txid?: string | null;
    liveMessageId?: number | null;
    ledgerRef?: string | null;
  },
): Promise<void> {
  const room = await getRoom(chatId);
  const ledgerRef = meta.ledgerRef || UI.newLedgerRef();
  const r = await recordOutgoing({
    adminTelegramId: userId,
    chatId,
    usdt,
    ledgerRef,
    slipImageUrl: meta.slipUrl ?? null,
    usdtNetwork: meta.network ?? null,
    usdtTxid: meta.txid ?? null,
  });

  // คงเหลือที่ต้องส่ง = (ยอดรับรวม / เรต) − ส่งไปแล้ว
  const [led, recent] = await Promise.all([
    getTodayLedger(room.dayCutAt, chatId),
    getRecentPairs(chatId, room.dayCutAt, 5).catch(() => []),
  ]);
  const shouldSend = room.rate ? led.totalThb / room.rate : led.totalIncomingUsdt;
  const remaining = shouldSend - led.totalOutgoingUsdt;

  await liveEdit(
    chatId,
    meta.liveMessageId,
    UI.outgoingRecorded({
      transactionId: r.transactionId,
      ledgerRef,
      usdt,
      adminName: r.adminName,
      remainingUsdt: remaining,
      recent,
    }),
  );
  sticker(chatId, 'SUCCESS');
}

async function replyPinOk(
  chatId: number,
  today: string,
  bank: { bank_name: string; account_number: string | null; label: string },
) {
  const list = await listPinnedBanksForToday(today);
  await sendMessage(
    chatId,
    UI.pinSetOk({
      today,
      bank_name: bank.bank_name,
      last4: last4OfAccount(bank.account_number) || '????',
      label: bank.label,
      count: list.length,
      max: MAX_PINNED_TODAY,
    }),
  );
}

/** /pin [BANK] [account] — เซ็ตบัญชีรับวันนี้ (สูงสุด 3) */
async function handlePinCommand(chatId: number, text: string): Promise<void> {
  const today = bangkokDate();
  const raw = text
    .replace(/^\/pin(@\w+)?/i, '')
    .replace(/^\/ปักหมุด(@\w+)?/i, '')
    .trim();

  if (!raw || raw === 'status' || raw === 'สถานะ') {
    const banks = await listPinnedBanksForToday(today);
    await sendMessage(chatId, UI.pinStatusCard({ today, banks, max: MAX_PINNED_TODAY }));
    return;
  }

  const pinOrLimit = async (
    fn: () => Promise<{ bank_name: string; account_number: string | null; label: string }>,
  ) => {
    try {
      const bank = await fn();
      await replyPinOk(chatId, today, bank);
    } catch (e: any) {
      if (e instanceof PinLimitError || e?.name === 'PinLimitError') {
        await sendMessage(
          chatId,
          UI.pinLimitCard({ today, banks: e.pinned ?? [], max: MAX_PINNED_TODAY }),
        );
        return;
      }
      await sendMessage(chatId, UI.error(e?.message ?? 'pin failed'));
    }
  };

  if (raw === 'default' || raw === 'หลัก') {
    const id = await getDefaultBankAccountId();
    if (!id) {
      await sendMessage(chatId, {
        text: 'ยังไม่มีบัญชีในระบบ — พิมพ์ <code>/pin kbank 1234567890</code>',
      });
      return;
    }
    await pinOrLimit(() => pinBankForToday(id, today));
    return;
  }

  // /pin kbank 1234567890 | /pin SCB 1234 | /pin 1234567890 | /pin 1234
  const parts = raw.split(/\s+/);
  let bankCode = 'KBANK';
  let account = '';
  if (parts.length >= 2) {
    bankCode = parts[0]!;
    account = parts.slice(1).join('');
  } else {
    account = parts[0] || '';
  }

  const digits = account.replace(/\D/g, '');
  if (digits.length === 4) {
    const all = await listBankAccounts();
    const hit = all.find((b) => last4OfAccount(b.account_number) === digits);
    if (!hit) {
      await sendMessage(chatId, {
        text:
          `ไม่พบบัญชีท้าย <code>${digits}</code> ในระบบ\n` +
          `พิมพ์เต็ม เช่น <code>/pin kbank 1234567890</code>`,
      });
      return;
    }
    await pinOrLimit(() => pinBankForToday(hit.id, today));
    return;
  }

  if (digits.length < 4) {
    await sendMessage(chatId, {
      text:
        `รูปแบบ: <code>/pin kbank 1234567890</code>\n` +
        `<i>คำย่อ: scb · kbank · ktb · bbl · tmn</i> · สูงสุด ${MAX_PINNED_TODAY} บัญชี`,
    });
    return;
  }

  await pinOrLimit(() => upsertAndPinBank({ bank: bankCode, accountNumber: digits }));
}

/** /unpin [n|last4|bank last4] — ลบบัญชีรับที่เซ็ตไว้ */
async function handleUnpinCommand(chatId: number, text: string): Promise<void> {
  const today = bangkokDate();
  const raw = text
    .replace(/^\/unpin(@\w+)?/i, '')
    .replace(/^\/เลิกปัก(@\w+)?/i, '')
    .trim();

  const banks = await listPinnedBanksForToday(today);
  if (banks.length === 0) {
    await sendMessage(chatId, UI.pinStatusCard({ today, banks: [], max: MAX_PINNED_TODAY }));
    return;
  }

  if (!raw) {
    await sendMessage(chatId, UI.pinStatusCard({ today, banks, max: MAX_PINNED_TODAY }));
    return;
  }

  const parts = raw.split(/\s+/);
  let removed = null as Awaited<ReturnType<typeof unpinPinnedByHint>>;

  if (/^\d+$/.test(parts[0]!) && parts[0]!.length <= 2) {
    removed = await unpinPinnedByHint({ index: Number(parts[0]) }, today);
  } else if (parts.length >= 2) {
    removed = await unpinPinnedByHint(
      { bank: parts[0], last4: parts[1]!.replace(/\D/g, '').slice(-4) },
      today,
    );
  } else {
    const digits = parts[0]!.replace(/\D/g, '');
    removed = await unpinPinnedByHint({ last4: digits.slice(-4) }, today);
  }

  if (!removed) {
    await sendMessage(chatId, {
      text: `ไม่พบรายการที่ตรง — ดูรายการด้วย <code>/pin</code> แล้วใช้ <code>/unpin 1</code>`,
    });
    return;
  }

  const left = await listPinnedBanksForToday(today);
  await sendMessage(chatId, {
    text:
      `🗑 ลบ <b>${removed.bank_name}</b> <code>••••${last4OfAccount(removed.account_number) || '????'}</code> แล้ว\n` +
      `เหลือ ${left.length}/${MAX_PINNED_TODAY} บัญชี`,
  });
  if (left.length) {
    await sendMessage(chatId, UI.pinStatusCard({ today, banks: left, max: MAX_PINNED_TODAY }));
  }
}

/** เริ่มวันใหม่: โพสต์สรุปวันเก่าก่อน → ตั้ง day-cut → ยืนยัน */
async function doNewDay(chatId: number): Promise<void> {
  await sendMessage(chatId, { text: '🗓 <b>สรุปยอดก่อนเริ่มวันใหม่</b>' });
  await sendLedger(chatId); // สรุปวันเก่า (ก่อนตัด)
  await startNewDay(chatId);
  const label = new Date().toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
  await sendMessage(chatId, UI.newDayStarted(label));
}

/** ส่งการ์ดสรุปยอด "ห้องนี้" + เกณฑ์แสดงผลจริง (เวลา · ลูกค้า · บช · USDT · recent 5) */
async function sendLedger(chatId: number): Promise<void> {
  try {
    const room = await getRoom(chatId);
    const [led, staff, recent, tools] = await Promise.all([
      getTodayLedger(room.dayCutAt, chatId),
      getStaffLeaderboard(room.dayCutAt, chatId),
      getRecentPairs(chatId, room.dayCutAt, 5),
      getLiveToolsSnapshot({ chatId }).catch(() => null),
    ]);
    await sendMessage(
      chatId,
      UI.ledgerCard({
        incomingList: led.incomingList,
        outgoingList: led.outgoingList,
        totalThb: led.totalThb,
        totalIncomingUsdt: led.totalIncomingUsdt,
        totalOutgoingUsdt: led.totalOutgoingUsdt,
        fixedRate: room.rate,
        feePercent: 0,
        netProfitThb: led.netProfitThb,
        lastAdminName: led.lastAdminName,
        roomName: room.name,
        staff,
        recent,
        nowLabel: tools?.nowLabel ?? bangkokNowLabel(),
        pinnedBanks:
          tools?.pinnedBanks ??
          (await listPinnedBanksForToday().then((list) =>
            list.map((b) => ({
              bank_name: b.bank_name,
              last4: last4OfAccount(b.account_number) || '????',
              balance: b.current_balance,
            })),
          )),
        lastCustomer: tools?.lastCustomer
          ? {
              name: tools.lastCustomer.name,
              bank: tools.lastCustomer.bank,
              last4: tools.lastCustomer.last4,
              thb: tools.lastCustomer.thb,
            }
          : null,
      }),
    );
  } catch (e: any) {
    console.error('[sendLedger]', e?.message || e);
    await sendMessage(chatId, {
      text:
        `⚠️ <b>บันทึกแล้ว แต่สรุปยอดยังโหลดไม่ครบ</b>\n` +
        `<i>${UI.sanitizeErrorDetail(e?.message ?? String(e))}</i>\n` +
        `ลองพิมพ์ /today อีกครั้ง`,
    }).catch(() => undefined);
  }
}

// รวมฟิลด์ deal ของ session เดิม (setSession เขียนทับทุกคอลัมน์ ต้องส่งครบกันหาย)
function dealSessionFields(session: any): any {
  return {
    pending_type: 'THB_DEPOSIT',
    slip_url: session.slip_url ?? null,
    ocr_thb: session.ocr_thb ?? null,
    slip_date: session.slip_date ?? null,
    slip_time: session.slip_time ?? null,
    slip_last4: session.slip_last4 ?? null,
    slip_bank: session.slip_bank ?? null,
    slip_receiver_name: session.slip_receiver_name ?? null,
    ocr_conf: session.ocr_conf ?? null,
    ledger_ref: session.ledger_ref ?? null,
    pending_usdt: session.pending_usdt ?? null,
    usdt_network: session.usdt_network ?? null,
    usdt_txid: session.usdt_txid ?? null,
    usdt_image_url: session.usdt_image_url ?? null,
    admin_id: session.admin_id ?? null,
    admin_name: session.admin_name ?? null,
    live_message_id: session.live_message_id ?? null,
    pin_matched: session.pin_matched ?? null,
  };
}

/**
 * Confirmation Card — Buy Rate = THB ÷ USDT, Sell Rate = room daily /setrate
 * Live-edits the same message when live_message_id is set.
 */
async function presentDealConfirm(
  chatId: number,
  userId: number,
  session: any,
  usdt: number,
  usdtMeta: { network: string | null; txid: string | null; imageUrl: string } | null,
  thbOverride?: number,
): Promise<void> {
  const thb = Number(thbOverride ?? session.ocr_thb) || 0;
  const liveId = session.live_message_id ?? null;
  if (!thb) {
    await liveEdit(chatId, liveId, {
      text:
        `<b>CE VAULT</b>\n<i>Secure Ledger</i>\n` +
        `────────────────\n` +
        `THB required\n<code>+500B -13.6U</code>`,
    });
    return;
  }

  // req13: cross-verify OCR vs manual
  const prior = session.pending_usdt != null ? Number(session.pending_usdt) : null;
  const priorFromOcr = !!session.usdt_image_url;
  const nowFromOcr = !!usdtMeta;
  if (
    prior != null &&
    prior > 0 &&
    priorFromOcr !== nowFromOcr &&
    Math.abs(prior - usdt) > USDT_TOLERANCE
  ) {
    const ocrVal = nowFromOcr ? usdt : prior;
    const manualVal = nowFromOcr ? prior : usdt;
    await setSession(chatId, userId, {
      ...dealSessionFields(session),
      state: 'WAITING_USDT',
      pending_usdt: null,
    });
    await liveEdit(chatId, liveId, UI.usdtMismatch(ocrVal, manualVal));
    return;
  }

  const room = await getRoom(chatId);
  const sellRate = room.rate ?? (await getLatestRates()).sellRate;
  const buyRate = usdt > 0 ? thb / usdt : 0; // Buy Rate = THB ÷ USDT
  const profitThb = usdt * sellRate - thb;
  const ledgerRef = session.ledger_ref || UI.newLedgerRef();
  const historyLine = await loadReceiverHistoryLine(
    session.slip_bank ?? null,
    session.slip_last4 ?? null,
  );

  const confirmMsg = UI.dealConfirm({
    ledgerRef,
    thb,
    usdt,
    buyRate,
    sellRate,
    profitThb,
    receiverName: session.slip_receiver_name,
    bank: session.slip_bank,
    last4: session.slip_last4,
    network: usdtMeta?.network ?? session.usdt_network ?? null,
    confidence: session.ocr_conf != null ? Number(session.ocr_conf) : null,
    historyLine,
  });

  const mid = await liveEdit(chatId, liveId, confirmMsg);

  await setSession(chatId, userId, {
    ...dealSessionFields(session),
    state: 'WAITING_USDT',
    ocr_thb: thb,
    ledger_ref: ledgerRef,
    pending_usdt: usdt,
    usdt_network: usdtMeta?.network ?? session.usdt_network ?? null,
    usdt_txid: usdtMeta?.txid ?? session.usdt_txid ?? null,
    usdt_image_url: usdtMeta?.imageUrl ?? session.usdt_image_url ?? null,
    live_message_id: mid,
  });
}

/** บันทึกดีลจริง — Buy Rate จาก recordDeal (THB÷USDT) · Live SUCCESS card */
async function finalizeDeal(
  chatId: number,
  userId: number,
  session: any,
  thb: number,
  usdt: number,
  sellRate: number,
  roomName: string | null,
  liveMessageId?: number | null,
): Promise<void> {
  const [bankAccountId, room] = await Promise.all([getDefaultBankAccountId(), getRoom(chatId)]);
  const ledgerRef = session.ledger_ref || UI.newLedgerRef();

  const r = await recordDeal({
    adminTelegramId: userId,
    chatId,
    thb,
    usdt,
    sellRate,
    roomName: roomName ?? room.name,
    ocrConfidence: session.ocr_conf ?? null,
    ledgerRef,
    slipImageUrl: session.slip_url ?? null,
    usdtImageUrl: session.usdt_image_url ?? null,
    usdtNetwork: session.usdt_network ?? null,
    usdtTxid: session.usdt_txid ?? null,
    receiver: {
      name: session.slip_receiver_name,
      bank: session.slip_bank,
      last4: session.slip_last4,
    },
    bankAccountId,
  });

  if (session.slip_last4) {
    upsertReceiverOnDeposit({
      bank: session.slip_bank ?? null,
      last4: session.slip_last4,
      receiverName: session.slip_receiver_name ?? null,
      thb,
      usdt,
      ledgerRef,
    })
      .then((receiverId) => {
        if (receiverId)
          return adminDb
            .collection('transactions')
            .doc(r.transactionId)
            .update({ receiver_id: receiverId })
            .then(
              () => undefined,
              () => undefined,
            );
      })
      .catch(() => undefined);
  }

  const historyLine = await loadReceiverHistoryLine(
    session.slip_bank ?? null,
    session.slip_last4 ?? null,
  );
  const success = UI.dealSuccess({
    transactionId: r.transactionId,
    ledgerRef,
    adminName: r.adminName,
    thb,
    usdt,
    buyRate: r.buyRate,
    sellRate: r.sellRate,
    profitThb: r.profitThb,
    receiverName: session.slip_receiver_name,
    bank: session.slip_bank,
    last4: session.slip_last4,
  });
  if (historyLine) success.text += `\n\n${historyLine}`;

  await liveEdit(chatId, liveMessageId ?? session.live_message_id, success);
  sticker(chatId, 'SUCCESS');
}

/** จัดการปุ่ม inline: edit:<txId> / del:<txId> / confirm:<usdt> */
async function handleCallback(cb: any): Promise<void> {
  const id: string = cb.id;
  const chatId: number = cb.message?.chat?.id;
  const userId: number = cb.from?.id;
  const data: string = cb.data || '';
  if (!chatId || !userId) return await answerCallback(id);

  const [action, arg] = data.split(':');
  if (!arg) return await answerCallback(id);

  // ----- dealok:<ledgerRef> : Confirm → settle (Live SUCCESS) -----
  if (action === 'dealok') {
    const session = await getSession(chatId, userId);
    if (!session || session.state !== 'WAITING_USDT' || !session.pending_usdt) {
      return await answerCallback(id, 'Expired — send a new slip');
    }
    await answerCallback(id, 'Settling…');
    const thb = Number(session.ocr_thb) || 0;
    const usdt = Number(session.pending_usdt) || 0;
    const room = await getRoom(chatId);
    const sellRate = room.rate ?? (await getLatestRates()).sellRate;
    const liveId = session.live_message_id ?? cb.message?.message_id ?? null;
    await clearSession(chatId, userId);
    try {
      await finalizeDeal(chatId, userId, session, thb, usdt, sellRate, room.name, liveId);
    } catch (e: any) {
      await liveEdit(chatId, liveId, UI.error(e?.message ?? 'record failed'));
    }
    return;
  }

  // ----- dealedit : edit USDT on Live Card -----
  if (action === 'dealedit') {
    const session = await getSession(chatId, userId);
    if (!session || session.state !== 'WAITING_USDT') {
      return await answerCallback(id, 'Expired');
    }
    await answerCallback(id, 'Edit USDT');
    const liveId = session.live_message_id ?? cb.message?.message_id ?? null;
    const room = await getRoom(chatId);
    const rates = await getLatestRates();
    const sellRate = room.rate ?? rates.sellRate;
    const historyLine = await loadReceiverHistoryLine(
      session.slip_bank ?? null,
      session.slip_last4 ?? null,
    );
    await setSession(chatId, userId, {
      ...dealSessionFields(session),
      state: 'WAITING_USDT',
      pending_usdt: null,
      usdt_network: null,
      usdt_txid: null,
      usdt_image_url: null,
      live_message_id: liveId,
    });
    await liveEdit(
      chatId,
      liveId,
      UI.waitUsdt({
        thb: session.ocr_thb,
        bank: session.slip_bank,
        last4: session.slip_last4,
        receiverName: session.slip_receiver_name,
        date: session.slip_date,
        time: session.slip_time,
        confidence: session.ocr_conf,
        ledgerRef: session.ledger_ref || UI.newLedgerRef(),
        historyLine,
        roomRate: sellRate,
        roomName: room.name,
        pinMatched: !!session.pin_matched,
      }),
    );
    sticker(chatId, 'WAITING');
    return;
  }

  // ----- cancelop : cancel on Live Card -----
  if (action === 'cancelop') {
    const session = await getSession(chatId, userId);
    const liveId = session?.live_message_id ?? cb.message?.message_id ?? null;
    await clearSession(chatId, userId);
    await answerCallback(id, 'Cancelled');
    await liveEdit(chatId, liveId, UI.cancelled());
    return;
  }

  // ----- newday : เริ่มวันใหม่ (day-cut) → โพสต์สรุปวันเก่าก่อน -----
  if (action === 'newday') {
    await answerCallback(id, '🔄 เริ่มวันใหม่');
    await doNewDay(chatId);
    return;
  }

  // ----- menu_today : ปุ่มดูยอดจากเมนู -----
  if (action === 'menu_today') {
    await answerCallback(id);
    await sendLedger(chatId);
    return;
  }

  // ----- tools : alias → ยอดวันนี้ -----
  if (action === 'tools') {
    await answerCallback(id);
    await sendLedger(chatId);
    return;
  }

  // ----- pin_status : สถานะบัญชีรับที่เซ็ตไว้ -----
  if (action === 'pin_status') {
    await answerCallback(id);
    const banks = await listPinnedBanksForToday();
    await sendMessage(
      chatId,
      UI.pinStatusCard({ today: bangkokDate(), banks, max: MAX_PINNED_TODAY }),
    );
    return;
  }

  // ----- resetask : ถามยืนยันล้างยอดห้อง -----
  if (action === 'resetask') {
    await answerCallback(id);
    const room = await getRoom(chatId);
    await sendMessage(chatId, UI.resetAsk(room.name));
    return;
  }

  // ----- resetgo : ล้างยอดห้องนี้จริง (hard delete) — โพสต์สรุปเก็บไว้ก่อนลบ -----
  if (action === 'resetgo') {
    await answerCallback(id, '🗑 กำลังล้าง...');
    try {
      await sendMessage(chatId, { text: '🗂 <b>สรุปก่อนล้าง (เก็บไว้อ้างอิง)</b>' });
      await sendLedger(chatId);
      const n = await resetRoom(chatId);
      await startNewDay(chatId); // เผื่อ row เก่าไม่มี chat_id ก็ให้ day-cut ช่วยซ่อน
      await sendMessage(chatId, UI.resetDone(n));
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'reset failed'));
    }
    return;
  }

  const txId = arg;

  // ตรวจว่าคนกดปุ่มเป็นเจ้าของธุรกรรมนี้
  const txSnap = await adminDb.collection('transactions').doc(txId).get();
  const tx = txSnap.exists
    ? ({ id: txSnap.id, ...(txSnap.data() as any) } as {
        id: string;
        type: 'THB_DEPOSIT' | 'USDT_SEND';
        admins: { telegram_user_id: number; name: string } | null;
        admin_id?: string;
      })
    : null;
  // denormalized admins may lack telegram_user_id — fall back to admins collection
  let ownerTg = tx?.admins?.telegram_user_id;
  if (tx && ownerTg == null && tx.admin_id) {
    const a = await adminDb.collection('admins').doc(tx.admin_id).get();
    ownerTg = a.data()?.telegram_user_id;
  }
  if (!tx || ownerTg !== userId) {
    return await answerCallback(id, 'เฉพาะเจ้าของธุรกรรมกดได้เท่านั้น');
  }

  await answerCallback(id, action === 'edit' ? '⚡ เข้าโหมดแก้ไข' : '🗑 กำลังลบ...');

  if (action === 'edit') {
    await setSession(chatId, userId, {
      state: 'EDITING',
      pending_type: tx.type,
      caption: txId, // เก็บ tx_id ไว้ในฟิลด์ caption (ไม่ต้องแก้ schema)
    });
    await sendMessage(chatId, UI.editPrompt(tx.type));
  } else if (action === 'del') {
    try {
      const r = await deleteTransaction(txId);
      await sendMessage(chatId, UI.deleteSuccess(r.name, r.holdingUsdt));
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'delete failed'));
    }
  }
}
