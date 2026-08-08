// ============================================================
// POST /api/telegram/webhook — ตัวรับ update จาก Telegram (ออนไลน์ 24/7 บน Netlify)
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
  sendSticker,
} from '@/lib/telegram';
import { getSession, setSession, clearSession } from '@/lib/botSessions';
import LiveMessageService from '@/lib/liveMessage';
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
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendDocument } from '@/lib/telegram';
import { notifyDailySummary, notifyReady } from '@/lib/notifier';
import { analyzeSlip, analyzeUsdtScreenshot } from '@/lib/ocr';
import { parseAmounts } from '@/lib/amounts';
import { getReceiver, findReceiversByLast4, upsertReceiverOnDeposit } from '@/lib/receivers';
import { getSticker, validateStickers, type StickerState } from '@/config/stickers';

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
export const maxDuration = 30; // serverless function timeout budget (seconds)

// Validate sticker config at cold-start (logs warning, never crashes the webhook)
try { validateStickers(); } catch (e: any) { console.warn(`[sticker config] ${e.message}`); }

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET;

const log = (msg: string, data?: any) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, data || '');
};

const parseNums = (s: string): number[] =>
  s.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));

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

    // Timeout protection: 25s (function budget ~30s, buffer 5s)
    await Promise.race([
      handleUpdate(update),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('WEBHOOK_TIMEOUT')), 25000)
      ),
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
          bank: r.bank, last4: r.account_last4, name: r.receiver_name, status: r.status,
          totalTx: r.total_transactions, totalThb: Number(r.total_amount_thb),
          totalUsdt: Number(r.total_usdt), maxThb: Number(r.max_amount_thb),
          lastThb: Number(r.last_amount_thb), lastAt: r.last_transaction_at, lastRef: r.last_ledger_ref,
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

  // ----- /ยอด , /today , /ledger : สรุปยอดห้องนี้วันนี้ (แยกห้อง) -----
  if (text && (text.startsWith('/ยอด') || text.startsWith('/today') || text.startsWith('/ledger') || text.startsWith('/สรุป'))) {
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
      await sendMessage(chatId, { text: 'พิมพ์ <code>/setroom ห้อง A</code> เพื่อตั้งชื่อห้องนี้' });
      return;
    }
    await setRoomName(chatId, name);
    await sendMessage(chatId, UI.roomNameSet(name));
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
  if (text && (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/register'))) {
    const existing = await getAdminByTelegramId(userId);
    if (existing) {
      await setSession(chatId, userId, { state: 'AWAITING_NAME', admin_id: existing.id, admin_name: existing.name });
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
      const market: number = (nums[1] ?? r.marketUsdtRate ?? Number(process.env.DEFAULT_MARKET_RATE) ?? 34.8) as number;
      await insertRate(admin.id, sell, market);
      await sendMessage(chatId, UI.rateSet(admin.name, sell, market));
    } else {
      await sendMessage(chatId, UI.rateShow(r.sellRate, r.marketUsdtRate, r.marketSource));
    }
    return;
  }

  // ----- /recent_slips : ส่งรายการสลิปล่าสุดเป็นเทมเพลตข้อความ พร้อม mention ผู้ดูแล -----
  if (text && text.startsWith('/recent_slips')) {
    const parts = text.split(/\s+/);
    const limit = Math.min(20, Math.max(1, Number(parts[1]) || 5));
    try {
      const pairs = await getRecentPairs(chatId, undefined, limit);
      // Fetch admin list for mentions (best-effort)
      let adminMentions = '';
      try {
        const { data: admins } = await supabaseAdmin.from('admins').select('name, telegram_user_id');
        if (Array.isArray(admins) && admins.length > 0) {
          adminMentions = admins
            .map((a: any) => (a.telegram_user_id ? `<a href="tg://user?id=${a.telegram_user_id}">${a.name || 'admin'}</a>` : `${a.name}`))
            .join(' ');
        }
      } catch (e) {
        // ignore
      }

      if (pairs.length === 0) {
        await sendMessage(chatId, { text: `🔷 ━━━━━━━━━━━━━\n⬢ CE VAULT · รายการล่าสุด\n\nไม่มีสลิปล่าสุดในห้องนี้` });
        return;
      }

      const lines = pairs.map((p, i) => {
        const status = p.gapMin == null ? 'รอส่ง' : `ส่งแล้ว (${p.gapMin} นาที)`;
        return `${i + 1}. • ${p.time} • ${p.thb} THB → ${p.usdt} USDT • ${status}`;
      });
      const header = `🔷 ━━━━━━━━━━━━━\n⬢ CE VAULT · รายการล่าสุด (${pairs.length})\n\n`;
      const footer = `\n\nผู้ดูแล: ${adminMentions || 'ยังไม่ระบุผู้ดูแล'}\n/confirm_<id> เพื่อยืนยันหรือแก้ไข`;
      await sendMessage(chatId, { text: header + lines.join('\n') + footer });
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'ไม่สามารถดึงรายการล่าสุดได้'));
    }
    return;
  }

  // ----- /save_slip : บันทึกรูปสลิป (ส่งคำสั่งโดย reply ถึงรูป) -----
  if (text && text.startsWith('/save_slip')) {
    // ต้อง reply ถึงข้อความที่มีรูป
    if (!msg.reply_to_message || !msg.reply_to_message.photo) {
      await sendMessage(chatId, { text: 'โปรดตอบกลับ (reply) ไปยังรูปสลิปที่ต้องการบันทึก' });
      return;
    }
    if (!admin) {
      await sendMessage(chatId, { text: 'คำสั่งนี้ต้องใช้โดยผู้ดูแลระบบเท่านั้น' });
      return;
    }

    const fileId = msg.reply_to_message.photo[msg.reply_to_message.photo.length - 1].file_id;
    sticker(chatId, 'PROCESSING');
    try {
      const imgUrl = await uploadSlipFromTelegram(fileId);
      const slip = await analyzeSlip(imgUrl);
      if (slip?.thbAmount && slip.thbAmount > 0) {
        await clearSession(chatId, userId);
        const res = await commitIncoming(chatId, userId, slip.thbAmount, {
          slipUrl: imgUrl,
          bank: slip.bank ?? null,
          last4: slip.receiverLast4 ?? null,
          receiverName: slip.receiverName ?? null,
          confidence: slip.confidence ?? null,
        });
        sticker(chatId, 'OCR_DONE');
        // If we created a live message, edit it to show OCR details; otherwise send a regular incoming card
        if (res.liveMessageId) {
          await LiveMessageService.update(res.transactionId, chatId, res.liveMessageId, 'OCR', UI.liveOcrUpdate({
            ledgerRef: res.ledgerRef,
            thb: res.thb,
            receiver: res.adminName,
            bank: res.bank ?? null,
            confidence: res.confidence ?? null,
            sellRate: res.sellRate,
            marketRate: null,
            shouldSend: Number(res.usdtOwed),
          }));
        } else {
          await sendMessage(chatId, UI.incomingRecorded({
            transactionId: res.transactionId,
            ledgerRef: res.ledgerRef,
            thb: res.thb,
            usdtOwed: res.usdtOwed,
            sellRate: res.sellRate,
            adminName: res.adminName,
            bank: res.bank ?? null,
            last4: res.last4 ?? null,
            confidence: res.confidence ?? null,
            todayIncoming: res.todayIncoming,
            todayTotalThb: res.todayTotalThb,
          }));
        }
      } else {
        await setSession(chatId, userId, {
          state: 'WAITING_USDT',
          pending_type: 'THB_DEPOSIT',
          slip_url: imgUrl,
          ocr_thb: slip?.thbAmount ?? null,
          slip_last4: slip?.receiverLast4 ?? null,
          slip_bank: slip?.bank ?? null,
          slip_receiver_name: slip?.receiverName ?? null,
          ocr_conf: slip?.confidence ?? null,
          ledger_ref: UI.newLedgerRef(),
          admin_id: admin.id,
          admin_name: admin.name,
        });
        await sendMessage(chatId, { text: 'อ่านสลิปไม่ชัดเจน — กรุณาระบุจำนวนที่ส่งด้วยข้อความ (เช่น 5000)' });
      }
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'upload failed'));
    }
    return;
  }

  // ----- รูปภาพ: สลิป THB → บันทึกทันที / สกรีนช็อต USDT → บันทึกขาออก -----
  if (msg.photo) {
    if (!admin) {
      await setSession(chatId, userId, { state: 'AWAITING_NAME' });
      await sendMessage(chatId, UI.askName());
      return;
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    sticker(chatId, 'PROCESSING'); // แสดงมาสคอตกำลังอ่านสลิป (fire-and-forget)
    try {
      const imgUrl = await uploadSlipFromTelegram(fileId);
      const slip = await analyzeSlip(imgUrl);

      // (A) อ่านยอดบาทได้ + มั่นใจพอ → บันทึกขาเข้าเลย ไม่ถาม
      if (slip?.thbAmount && slip.thbAmount > 0 && (slip.confidence == null || slip.confidence >= OCR_AUTO_MIN)) {
        await clearSession(chatId, userId);
        const res = await commitIncoming(chatId, userId, slip.thbAmount, {
          slipUrl: imgUrl,
          bank: slip.bank ?? null,
          last4: slip.receiverLast4 ?? null,
          receiverName: slip.receiverName ?? null,
          confidence: slip.confidence ?? null,
        });
        sticker(chatId, 'OCR_DONE');
        if (res.liveMessageId) {
          await LiveMessageService.update(res.transactionId, chatId, res.liveMessageId, 'OCR', UI.liveOcrUpdate({
            ledgerRef: res.ledgerRef,
            thb: res.thb,
            receiver: res.adminName,
            bank: res.bank ?? null,
            confidence: res.confidence ?? null,
            sellRate: res.sellRate,
            marketRate: null,
            shouldSend: Number(res.usdtOwed),
          }));
        } else {
          await sendMessage(chatId, UI.incomingRecorded({
            transactionId: res.transactionId,
            ledgerRef: res.ledgerRef,
            thb: res.thb,
            usdtOwed: res.usdtOwed,
            sellRate: res.sellRate,
            adminName: res.adminName,
            bank: res.bank ?? null,
            last4: res.last4 ?? null,
            confidence: res.confidence ?? null,
            todayIncoming: res.todayIncoming,
            todayTotalThb: res.todayTotalThb,
          }));
        }
        return;
      }

      // (B) ไม่ใช่สลิปบาท → ลองอ่านเป็นสกรีนช็อตโอน USDT → บันทึกขาออก
      const u = await analyzeUsdtScreenshot(imgUrl);
      if (u?.amount && u.amount > 0) {
        const res = await commitOutgoing(chatId, userId, u.amount, {
          slipUrl: imgUrl, network: u.network ?? null, txid: u.txid ?? null,
        });
        // If live message exists, commitOutgoing attempted to edit it — avoid duplicate posting
        try {
          const s = await getSession(chatId, userId);
          if (!s?.live_message_id) {
            await sendMessage(chatId, UI.outgoingRecorded({
              transactionId: res.transactionId,
              ledgerRef: res.ledgerRef,
              usdt: res.usdt,
              adminName: res.adminName,
              shouldSendUsdt: res.shouldSendUsdt,
              remainingUsdt: res.remainingUsdt,
            }));
          }
        } catch (e) {
          await sendMessage(chatId, UI.outgoingRecorded({
            transactionId: res.transactionId,
            ledgerRef: res.ledgerRef,
            usdt: res.usdt,
            adminName: res.adminName,
            shouldSendUsdt: res.shouldSendUsdt,
            remainingUsdt: res.remainingUsdt,
          }));
        }
        sticker(chatId, 'SUCCESS');
        await sendLedger(chatId);
        return;
      }

      // (C) อ่านไม่ชัดจริงๆ → เก็บ meta ไว้ แล้วขอสั้นๆ ครั้งเดียว
      await setSession(chatId, userId, {
        state: 'WAITING_USDT',
        pending_type: 'THB_DEPOSIT',
        slip_url: imgUrl,
        ocr_thb: slip?.thbAmount ?? null,
        slip_last4: slip?.receiverLast4 ?? null,
        slip_bank: slip?.bank ?? null,
        slip_receiver_name: slip?.receiverName ?? null,
        ocr_conf: slip?.confidence ?? null,
        ledger_ref: UI.newLedgerRef(),
        admin_id: admin.id,
        admin_name: admin.name,
      });
      await sendMessage(chatId, UI.slipUnclear(slip?.thbAmount ?? null));
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'upload failed'));
    }
    return;
  }

  // ----- ข้อความตัวอักษร -----
  if (!text) return;

  // (ก) รอชื่อ → ลงทะเบียน
  if (session?.state === 'AWAITING_NAME') {
    const name = text.slice(0, 60);
    const created = await upsertAdmin(userId, name);
    await clearSession(chatId, userId);
    await sendMessage(chatId, UI.registered(created.name));
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
      const { data: old } = await supabaseAdmin
        .from('transactions')
        .select('type, usdt_amount')
        .eq('id', txId)
        .single();
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

  // (ข) พิมพ์ยอด: +500 = บาทเข้า · -13.6 = USDT ออก · อย่างอื่นเงียบ (ไม่ถามกลับ)
  {
    const amt = parseAmounts(text);
    if (amt.thb && amt.thb.sign > 0) {
      // ขาเข้า — ผูก meta จากสลิปที่ค้างอยู่ (ถ้ามี)
      const meta = session?.state === 'WAITING_USDT'
        ? {
            slipUrl: session.slip_url ?? null,
            bank: session.slip_bank ?? null,
            last4: session.slip_last4 ?? null,
            receiverName: session.slip_receiver_name ?? null,
            confidence: session.ocr_conf != null ? Number(session.ocr_conf) : null,
          }
        : {};
      if (session?.state === 'WAITING_USDT') await clearSession(chatId, userId);
      try {
        const res = await commitIncoming(chatId, userId, amt.thb.value, meta);
        // If commitIncoming created/returned a live message, update it to OCR view; otherwise send a normal incoming card
        if (res.liveMessageId) {
          await LiveMessageService.update(res.transactionId, chatId, res.liveMessageId, 'OCR', UI.liveOcrUpdate({
            ledgerRef: res.ledgerRef,
            thb: res.thb,
            receiver: res.adminName,
            bank: res.bank ?? null,
            confidence: res.confidence ?? null,
            sellRate: res.sellRate,
            marketRate: null,
            shouldSend: Number(res.usdtOwed),
          }));
        } else {
          await sendMessage(chatId, UI.incomingRecorded({
            transactionId: res.transactionId,
            ledgerRef: res.ledgerRef,
            thb: res.thb,
            usdtOwed: res.usdtOwed,
            sellRate: res.sellRate,
            adminName: res.adminName,
            bank: res.bank ?? null,
            last4: res.last4 ?? null,
            confidence: res.confidence ?? null,
            todayIncoming: res.todayIncoming,
            todayTotalThb: res.todayTotalThb,
          }));
        }
        sticker(chatId, 'SUCCESS');
      } catch (e: any) {
        await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
      }
      return;
    }
    if (amt.usdt && amt.usdt.sign < 0) {
      try {
        const res = await commitOutgoing(chatId, userId, amt.usdt.value, {});
        // If there's a live message for this session, commitOutgoing already edited it — skip duplicate post
        try {
          const s = await getSession(chatId, userId);
          if (!s?.live_message_id) {
            await sendMessage(chatId, UI.outgoingRecorded({
              transactionId: res.transactionId,
              ledgerRef: res.ledgerRef,
              usdt: res.usdt,
              adminName: res.adminName,
              shouldSendUsdt: res.shouldSendUsdt,
              remainingUsdt: res.remainingUsdt,
            }));
          }
        } catch (e) {
          await sendMessage(chatId, UI.outgoingRecorded({
            transactionId: res.transactionId,
            ledgerRef: res.ledgerRef,
            usdt: res.usdt,
            adminName: res.adminName,
            shouldSendUsdt: res.shouldSendUsdt,
            remainingUsdt: res.remainingUsdt,
          }));
        }
        sticker(chatId, 'SUCCESS');
      } catch (e: any) {
        await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
      }
      return;
    }
    // ไม่มีเครื่องหมายชัดเจน → เงียบ (กันรกแชท)
    if (amt.thb || amt.usdt) return;
  }

  // (ค) ไม่มี session — ในแชตส่วนตัวถามชื่ออัตโนมัติ / ในกลุ่มปล่อยผ่าน (กันสแปมคนอื่นในกลุ่ม)
  if (!admin && !isGroup) {
    await setSession(chatId, userId, { state: 'AWAITING_NAME' });
    await sendMessage(chatId, UI.askName());
  }
}

/** บันทึกขาเข้า (รับ THB) ทันที — ไม่ถามยืนยัน */
async function commitIncoming(
  chatId: number,
  userId: number,
  thb: number,
  meta: { slipUrl?: string | null; bank?: string | null; last4?: string | null; receiverName?: string | null; confidence?: number | null },
): Promise<any> {
  const [room, rates] = await Promise.all([getRoom(chatId), getLatestRates()]);
  const sellRate = room.rate ?? rates.sellRate;
  const ledgerRef = UI.newLedgerRef();

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
    receiver: { name: meta.receiverName ?? null, bank: meta.bank ?? null, last4: meta.last4 ?? null },
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
          return supabaseAdmin.from('transactions').update({ receiver_id: rid })
            .eq('id', r.transactionId).then(() => undefined, () => undefined);
      })
      .catch(() => undefined);
  }

  const led = await getTodayLedger(room.dayCutAt, chatId);

  // Create a single live message via LiveMessageService (centralized)
  const { liveMessageId } = await LiveMessageService.create({
    transactionId: r.transactionId,
    chatId,
    userId,
    ledgerRef,
    adminName: r.adminName,
  });

  // Return data for caller to decide how to render or further edit the live message
  return {
    transactionId: r.transactionId,
    ledgerRef,
    thb,
    usdtOwed: r.usdtOwed,
    sellRate,
    adminName: r.adminName,
    bank: meta.bank ?? null,
    last4: meta.last4 ?? null,
    confidence: meta.confidence ?? null,
    todayIncoming: led.incomingList.map((e) => ({ time: e.time, date: e.date, thb: e.thb })),
    todayTotalThb: led.totalThb,
    liveMessageId,
  };
}

/** บันทึกขาออก (ส่ง USDT) ทันที */
async function commitOutgoing(
  chatId: number,
  userId: number,
  usdt: number,
  meta: { slipUrl?: string | null; network?: string | null; txid?: string | null },
): Promise<any> {
  const room = await getRoom(chatId);
  const ledgerRef = UI.newLedgerRef();
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
  const led = await getTodayLedger(room.dayCutAt, chatId);
  const shouldSend = room.rate ? led.totalThb / room.rate : led.totalIncomingUsdt;
  const remaining = shouldSend - led.totalOutgoingUsdt;

  // Try to update live message (if any) with completed outgoing info via LiveMessageService
  try {
    const s = await getSession(chatId, userId);
    const liveId = s?.live_message_id ?? null;
    if (liveId) {
      await LiveMessageService.complete(r.transactionId, chatId, liveId, {
        ledgerRef,
        thb: led.totalThb,
        usdt,
        profitThb: Number((led.netProfitThb ?? 0)),
        remaining: remaining,
        todayTotalThb: led.totalThb,
      });
    }
  } catch (e) {
    // ignore edit failures
  }

  // Return data for caller to render/update a live message
  return {
    transactionId: r.transactionId,
    ledgerRef,
    usdt,
    adminName: r.adminName,
    shouldSendUsdt: shouldSend,
    remainingUsdt: remaining,
  };
}

/** เริ่มวันใหม่: โพสต์สรุปวันเก่าก่อน → ตั้ง day-cut → ยืนยัน */
async function doNewDay(chatId: number): Promise<void> {
  await sendMessage(chatId, { text: '🗓 <b>สรุปยอดก่อนเริ่มวันใหม่</b>' });
  await sendLedger(chatId); // สรุปวันเก่า (ก่อนตัด)
  await startNewDay(chatId);
  const label = new Date().toLocaleString('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
  });
  await sendMessage(chatId, UI.newDayStarted(label));
}

/** ส่งการ์ดสรุปยอด "ห้องนี้" (แยกตาม chat_id + day-cut) + Top Staff + 5 รายการล่าสุด */
async function sendLedger(chatId: number): Promise<void> {
  const room = await getRoom(chatId);
  const [led, staff, recent] = await Promise.all([
    getTodayLedger(room.dayCutAt, chatId),
    getStaffLeaderboard(room.dayCutAt, chatId),
    getRecentPairs(chatId, room.dayCutAt, 5),
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
    }),
  );
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
  };
}

/**
 * คำนวณดีล + โชว์การ์ดยืนยัน (Confirm/Edit/Cancel)
 * usdtMeta != null = มาจากสกรีนช็อต (OCR), = null = พิมพ์เอง (manual)
 * req13: ถ้ามีทั้ง OCR และ manual แล้วต่างกัน > 0.0001 → block + manual review
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
  if (!thb) {
    await sendMessage(chatId, { text: '⚠️ ยังไม่ทราบยอด THB — พิมพ์ <b>ยอดบาท จำนวนUSDT</b> เช่น <code>500 13.6</code>' });
    return;
  }

  // req13: cross-verify OCR vs manual
  const prior = session.pending_usdt != null ? Number(session.pending_usdt) : null;
  const priorFromOcr = !!session.usdt_image_url;
  const nowFromOcr = !!usdtMeta;
  if (prior != null && prior > 0 && priorFromOcr !== nowFromOcr && Math.abs(prior - usdt) > USDT_TOLERANCE) {
    const ocrVal = nowFromOcr ? usdt : prior;
    const manualVal = nowFromOcr ? prior : usdt;
    // block: ล้าง pending_usdt เพื่อกันกดปุ่มยืนยันเก่า → dealok จะปฏิเสธ
    await setSession(chatId, userId, { ...dealSessionFields(session), state: 'WAITING_USDT', pending_usdt: null });
    await sendMessage(chatId, UI.usdtMismatch(ocrVal, manualVal));
    return;
  }

  const room = await getRoom(chatId);
  const sellRate = room.rate ?? (await getLatestRates()).sellRate;
  const buyRate = usdt > 0 ? thb / usdt : 0;
  const profitThb = usdt * sellRate - thb;

  await setSession(chatId, userId, {
    ...dealSessionFields(session),
    state: 'WAITING_USDT',
    ocr_thb: thb,
    pending_usdt: usdt,
    usdt_network: usdtMeta?.network ?? session.usdt_network ?? null,
    usdt_txid: usdtMeta?.txid ?? session.usdt_txid ?? null,
    usdt_image_url: usdtMeta?.imageUrl ?? session.usdt_image_url ?? null,
  });

  await sendMessage(
    chatId,
    UI.dealConfirm({
      ledgerRef: session.ledger_ref || '—',
      thb, usdt, buyRate, sellRate, profitThb,
      receiverName: session.slip_receiver_name,
      bank: session.slip_bank,
      last4: session.slip_last4,
      network: usdtMeta?.network ?? session.usdt_network ?? null,
    }),
  );
}

/** บันทึกดีลจริง + การ์ดสำเร็จ + ledger รวมของวัน (รวม recent pairs) */
async function finalizeDeal(
  chatId: number,
  userId: number,
  session: any,
  thb: number,
  usdt: number,
  sellRate: number,
  roomName: string | null,
): Promise<void> {
  const [bankAccountId, room] = await Promise.all([getDefaultBankAccountId(), getRoom(chatId)]);
  const ledgerRef = session.ledger_ref || UI.newLedgerRef();

  const r = await recordDeal({
    adminTelegramId: userId,
    chatId,
    thb, usdt, sellRate, roomName: roomName ?? room.name,
    ocrConfidence: session.ocr_conf ?? null,
    ledgerRef,
    slipImageUrl: session.slip_url ?? null,
    usdtImageUrl: session.usdt_image_url ?? null,
    usdtNetwork: session.usdt_network ?? null,
    usdtTxid: session.usdt_txid ?? null,
    receiver: { name: session.slip_receiver_name, bank: session.slip_bank, last4: session.slip_last4 },
    bankAccountId,
  });

  // Receiver History (fire-and-forget)
  if (session.slip_last4) {
    upsertReceiverOnDeposit({
      bank: session.slip_bank ?? null,
      last4: session.slip_last4,
      receiverName: session.slip_receiver_name ?? null,
      thb, usdt, ledgerRef,
    })
      .then((receiverId) => {
        if (receiverId)
          return supabaseAdmin.from('transactions').update({ receiver_id: receiverId })
            .eq('id', r.transactionId).then(() => undefined, () => undefined);
      })
      .catch(() => undefined);
  }

  await sendMessage(
    chatId,
    UI.dealSuccess({
      transactionId: r.transactionId,
      ledgerRef,
      adminName: r.adminName,
      thb, usdt,
      buyRate: r.buyRate,
      sellRate: r.sellRate,
      profitThb: r.profitThb,
      receiverName: session.slip_receiver_name,
      bank: session.slip_bank,
      last4: session.slip_last4,
    }),
  );
  sticker(chatId, 'SUCCESS');

  // แสดง ledger สดรวม recent (หลัง recordDeal แล้ว → ข้อมูลครบ)
  await sendLedger(chatId);

  // Brand Success Card — ส่งต่อท้ายหลังข้อความปกติเสร็จทั้งหมด (fire-and-forget)
  sendMessage(
    chatId,
    UI.brandCard({
      usdt,
      txid: session.usdt_txid ?? null,
      network: session.usdt_network ?? null,
      ledgerRef,
      transactionId: r.transactionId,
    }),
  ).catch(() => undefined);
}

/** จัดการปุ่ม inline: edit:<txId> / del:<txId> / confirm:<usdt> */
async function handleCallback(cb: any): Promise<void> {
  const id: string = cb.id;
  const chatId: number = cb.message?.chat?.id;
  const userId: number = cb.from?.id;
  const data: string = cb.data || '';
  if (!chatId || !userId) return await answerCallback(id);

  const [action, arg] = data.split(':');
  if (!action) return await answerCallback(id);

  // helper: check role
  async function hasRole(required: ('SuperAdmin'|'Admin'|'Operator'|'Viewer')[]) {
    try {
      const adm = await getAdminByTelegramId(userId);
      const role = adm?.role ?? 'Operator';
      return required.includes(role as any);
    } catch (e) {
      return false;
    }
  }

  // ----- quick no-arg actions -----
  if (action === 'cancelop') {
    await clearSession(chatId, userId);
    await answerCallback(id, 'ยกเลิกแล้ว');
    await sendMessage(chatId, UI.cancelled());
    return;
  }

  if (action === 'refresh') {
    // Refresh live daily summary or a live message — permission: Viewer+
    await answerCallback(id, '🔄 Refreshing...');
    // If button is bound to a tx id, refresh that tx's live message
    if (arg) {
      const txId = arg;
      const { data: tx } = await supabaseAdmin.from('transactions').select('id, live_message_id, live_chat_id').eq('id', txId).maybeSingle();
      if (tx?.live_message_id && tx.live_chat_id) {
        // re-render liveCompleted minimal placeholder to force-update
        await LiveMessageService.update(txId, tx.live_chat_id, tx.live_message_id, 'Refresh', { text: UI.liveRefreshPlaceholder(txId).text });
      }
    } else {
      // fallback: send ledger
      await sendLedger(chatId);
    }
    return;
  }

  // ----- newday / menu_today / reset actions (permission Admin+ required) -----
  if (action === 'newday') {
    if (!await hasRole(['SuperAdmin','Admin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    await answerCallback(id, '🔄 เริ่มวันใหม่');
    await doNewDay(chatId);
    return;
  }
  if (action === 'menu_today') {
    await answerCallback(id);
    await sendLedger(chatId);
    return;
  }

  if (action === 'resetask') {
    if (!await hasRole(['SuperAdmin','Admin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    await answerCallback(id);
    const room = await getRoom(chatId);
    await sendMessage(chatId, UI.resetAsk(room.name));
    return;
  }
  if (action === 'resetgo') {
    if (!await hasRole(['SuperAdmin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    await answerCallback(id, '🗑 กำลังล้าง...');
    try {
      await sendMessage(chatId, { text: '🗂 <b>สรุปก่อนล้าง (เก็บไว้อ้างอิง)</b>' });
      await sendLedger(chatId);
      const n = await resetRoom(chatId);
      await startNewDay(chatId);
      await sendMessage(chatId, UI.resetDone(n));
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'reset failed'));
    }
    return;
  }

  // ----- actions that target a transaction id -----
  if (!arg) return await answerCallback(id);
  const txId = arg;

  // load transaction and verify minimal permissions
  const { data: tx } = await supabaseAdmin
    .from('transactions')
    .select('id, type, admin_id, live_message_id, live_chat_id')
    .eq('id', txId)
    .maybeSingle();

  if (!tx) return await answerCallback(id, 'รายการไม่พบ');

  // load actor admin record
  const actor = await getAdminByTelegramId(userId);
  if (!actor) return await answerCallback(id, 'เฉพาะผู้ดูแลระบบเท่านั้น');

  // permission: owner or higher roles for edit/delete
  const isOwner = Boolean(actor && tx && actor.id === tx.admin_id);

  // ----- confirm / dealok : finalize (requires owner or Admin) -----
  if (action === 'confirm' || action === 'dealok') {
    if (!isOwner && !await hasRole(['SuperAdmin','Admin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    const session = await getSession(chatId, userId);
    if (!session || session.state !== 'WAITING_USDT' || !session.pending_usdt) {
      return await answerCallback(id, 'รายการหมดอายุ/ต้องตรวจสอบ — ส่งสลิปใหม่');
    }
    await answerCallback(id, '✅ กำลังบันทึก...');
    await clearSession(chatId, userId);
    const thb = Number(session.ocr_thb) || 0;
    const usdt = Number(session.pending_usdt) || 0;
    const room = await getRoom(chatId);
    const sellRate = room.rate ?? (await getLatestRates()).sellRate;
    try {
      await finalizeDeal(chatId, userId, session, thb, usdt, sellRate, room.name);
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
    }
    return;
  }

  // ----- edit / dealedit : allow owner or Admin to modify pending USDT -----
  if (action === 'edit' || action === 'dealedit') {
    if (!isOwner && !await hasRole(['SuperAdmin','Admin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    const session = await getSession(chatId, userId);
    if (!session || session.state !== 'WAITING_USDT') {
      return await answerCallback(id, 'รายการหมดอายุ');
    }
    await answerCallback(id, '✏️ แก้ USDT');
    await setSession(chatId, userId, {
      ...dealSessionFields(session),
      state: 'WAITING_USDT',
      pending_usdt: null, usdt_network: null, usdt_txid: null, usdt_image_url: null,
    });
    await sendMessage(chatId, { text: '⏳ ส่ง <b>สกรีนช็อต USDT</b> ใหม่ หรือพิมพ์ <b>จำนวน USDT</b>' });
    sticker(chatId, 'WAITING');
    return;
  }

  // ----- delete / del : allow owner or Admin (or SuperAdmin) -----
  if (action === 'delete' || action === 'del') {
    if (!isOwner && !await hasRole(['SuperAdmin','Admin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    await answerCallback(id, '🗑 กำลังลบ...');
    try {
      const r = await deleteTransaction(txId);
      await sendMessage(chatId, UI.deleteSuccess(r.name, r.holdingUsdt));
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'delete failed'));
    }
    return;
  }

  // ----- retry_ocr : re-run OCR for a pending slip (owner/Admin) -----
  if (action === 'retry_ocr') {
    if (!isOwner && !await hasRole(['SuperAdmin','Admin'])) return await answerCallback(id, 'สิทธิ์ไม่พอ');
    await answerCallback(id, '🔁 Re-running OCR...');
    const session = await getSession(chatId, userId);
    if (!session || !session.slip_url) return await answerCallback(id, 'ไม่พบสลิปที่ต้องการอ่านใหม่');
    try {
      const slip = await analyzeSlip(session.slip_url);
      // Update live message if exists
      const liveId = tx.live_message_id ?? session.live_message_id;
      if (liveId) {
        await LiveMessageService.update(txId, chatId, liveId, 'OCR', UI.liveOcrUpdate({
          ledgerRef: session.ledger_ref || '—',
          thb: slip.thbAmount ?? session.ocr_thb ?? 0,
          receiver: session.slip_receiver_name ?? undefined,
          bank: slip.bank ?? session.slip_bank ?? null,
          confidence: slip.confidence ?? null,
          sellRate: (await getRoom(chatId)).rate ?? (await getLatestRates()).sellRate,
          marketRate: null,
          shouldSend: Number(slip.thbAmount ? (slip.thbAmount / ((await getRoom(chatId)).rate || 1)) : 0),
        }));
      }
      await sendMessage(chatId, UI.info('OCR retried'));
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'OCR failed'));
    }
    return;
  }

  // Unknown action — default reply
  await answerCallback(id);
}

