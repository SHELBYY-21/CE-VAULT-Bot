// ============================================================
// POST /api/telegram/webhook — ตัวรับ update จาก Telegram (ออนไลน์ 24/7 บน Vercel)
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
} from '@/lib/transactions';
import { getChatRate, setChatRate, getRoom, startNewDay } from '@/lib/botSessions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { notifyDailySummary, notifyReady } from '@/lib/notifier';
import { analyzeSlip, analyzeUsdtScreenshot } from '@/lib/ocr';
import { getReceiver, findReceiversByLast4, upsertReceiverOnDeposit } from '@/lib/receivers';

// ตรวจ USDT (OCR vs พิมพ์เอง) ต้องตรงกันในระดับ 0.0001 (req 13)
const USDT_TOLERANCE = 0.0001;

export const runtime = 'nodejs';
export const maxDuration = 30; // Vercel serverless max 30s

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

    // Timeout protection: 25s (Vercel limit 30s, buffer 5s)
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

  // ----- /ยอด , /ledger : สรุปยอดวันนี้ (การ์ดเต็ม) -----
  if (text && (text.startsWith('/ยอด') || text.startsWith('/ledger') || text.startsWith('/สรุป'))) {
    const room = await getRoom(chatId);
    const led = await getTodayLedger(room.dayCutAt);
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
      }),
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

  // ----- รูปภาพ -----
  if (msg.photo) {
    if (!admin) {
      await setSession(chatId, userId, { state: 'AWAITING_NAME' });
      await sendMessage(chatId, UI.askName());
      return;
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    // ── (A) กำลังรอ USDT อยู่ → รูปนี้คือ "สกรีนช็อตโอน USDT" ──
    if (session?.state === 'WAITING_USDT') {
      const placeholderId = await sendMessage(chatId, UI.uploading(1));
      try {
        const usdtUrl = await uploadSlipFromTelegram(fileId);
        const u = await analyzeUsdtScreenshot(usdtUrl);
        if (!u || u.amount == null || u.amount <= 0) {
          await editMessage(chatId, placeholderId, {
            text: '⚠️ อ่านจำนวน USDT จากสกรีนช็อตไม่ได้ — พิมพ์จำนวน USDT เช่น <code>13.6</code>',
          });
          return;
        }
        await presentDealConfirm(chatId, userId, session, u.amount, {
          network: u.network ?? null, txid: u.txid ?? null, imageUrl: usdtUrl,
        });
        await editMessage(chatId, placeholderId, { text: `✅ อ่าน USDT ได้ <b>${u.amount}</b>` });
      } catch (e: any) {
        await editMessage(chatId, placeholderId, UI.error(e?.message ?? 'usdt ocr failed'));
      }
      return;
    }

    // ── (B) เริ่มดีลใหม่ → รูปนี้คือ "สลิปธนาคาร THB" ──
    const placeholderId = await sendMessage(chatId, UI.uploading(1));
    try {
      const slipUrl = await uploadSlipFromTelegram(fileId);
      const slip = await analyzeSlip(slipUrl);

      const [room, hist] = await Promise.all([
        getRoom(chatId),
        slip?.receiverLast4 ? getReceiver(slip.bank, slip.receiverLast4) : Promise.resolve(null),
      ]);
      const ledgerRef = UI.newLedgerRef();
      const historyLine = slip?.receiverLast4
        ? UI.receiverBrief(
            hist
              ? {
                  bank: hist.bank, last4: hist.account_last4, name: hist.receiver_name, status: hist.status,
                  totalTx: hist.total_transactions, totalThb: Number(hist.total_amount_thb),
                  lastAt: hist.last_transaction_at, lastRef: hist.last_ledger_ref,
                  todayCount: hist.todayCount, todayThb: hist.todayThb,
                }
              : null,
            slip.bank, slip.receiverLast4,
          )
        : null;

      await setSession(chatId, userId, {
        state: 'WAITING_USDT',
        pending_type: 'THB_DEPOSIT',
        slip_url: slipUrl,
        ocr_thb: slip?.thbAmount ?? null,
        slip_date: slip?.date ?? null,
        slip_time: slip?.time ?? null,
        slip_last4: slip?.receiverLast4 ?? null,
        slip_bank: slip?.bank ?? null,
        slip_receiver_name: slip?.receiverName ?? null,
        ocr_conf: slip?.confidence ?? null,
        ledger_ref: ledgerRef,
        admin_id: admin.id,
        admin_name: admin.name,
      });
      await editMessage(
        chatId,
        placeholderId,
        UI.waitUsdt({
          thb: slip?.thbAmount ?? null,
          bank: slip?.bank ?? null,
          last4: slip?.receiverLast4 ?? null,
          receiverName: slip?.receiverName ?? null,
          date: slip?.date ?? null,
          time: slip?.time ?? null,
          confidence: slip?.confidence ?? null,
          ledgerRef,
          historyLine,
          roomRate: room.rate,
          roomName: room.name,
        }),
      );
    } catch (e: any) {
      await editMessage(chatId, placeholderId, UI.error(e?.message ?? 'upload failed'));
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

  // (ข.5) กำลังแก้ไขธุรกรรม → อัปเดต tx เดิม
  if (session?.state === 'EDITING' && session.caption) {
    const nums = parseNums(text);
    if (nums.length === 0) return;
    const txId = session.caption; // เก็บ tx_id ไว้ในฟิลด์ caption
    await clearSession(chatId, userId);
    try {
      const { data: old } = await supabaseAdmin
        .from('transactions')
        .select('type')
        .eq('id', txId)
        .single();
      if (!old) throw new Error('ไม่พบธุรกรรมเดิม');

      const patch =
        old.type === 'USDT_SEND'
          ? { newUsdt: nums[0] }
          : nums.length >= 2
            ? { newThb: nums[0], newUsdt: nums[1] }
            : { newUsdt: nums[0] };
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

  // (ข) รอ USDT → พิมพ์จำนวน USDT (fallback แทนสกรีนช็อต) แล้วโชว์การ์ดยืนยัน
  if (session?.state === 'WAITING_USDT') {
    const nums = parseNums(text);
    if (nums.length === 0) return; // ไม่ใช่ตัวเลข ปล่อยผ่าน
    await sendChatAction(chatId, 'typing');
    try {
      // ถ้า OCR อ่าน THB ไม่ได้ ให้กู้คืน: พิมพ์ "THB USDT" หรือพิมพ์ THB ก่อน
      if (!session.ocr_thb) {
        if (nums.length >= 2) {
          await presentDealConfirm(chatId, userId, { ...session, ocr_thb: nums[0] }, nums[1], null, nums[0]);
        } else {
          // เก็บ THB ที่พิมพ์ แล้วรอ USDT ต่อ
          await setSession(chatId, userId, { ...dealSessionFields(session), state: 'WAITING_USDT', ocr_thb: nums[0] });
          await sendMessage(chatId, { text: `✅ ตั้งยอด THB = <b>${nums[0]}</b>\n⏳ ส่งสกรีนช็อต USDT หรือพิมพ์จำนวน USDT` });
        }
        return;
      }
      // มี THB แล้ว → เลขที่พิมพ์ = จำนวน USDT (2 ตัว = THB USDT override)
      if (nums.length >= 2) {
        await presentDealConfirm(chatId, userId, { ...session, ocr_thb: nums[0] }, nums[1], null, nums[0]);
      } else {
        await presentDealConfirm(chatId, userId, session, nums[0], null);
      }
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
    }
    return;
  }

  // (ค) ไม่มี session — ในแชตส่วนตัวถามชื่ออัตโนมัติ / ในกลุ่มปล่อยผ่าน (กันสแปมคนอื่นในกลุ่ม)
  if (!admin && !isGroup) {
    await setSession(chatId, userId, { state: 'AWAITING_NAME' });
    await sendMessage(chatId, UI.askName());
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

/** บันทึกดีลจริง + การ์ดสำเร็จ + ledger รวมของวัน */
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
  const led = await getTodayLedger(room.dayCutAt);
  const ledgerRef = session.ledger_ref || UI.newLedgerRef();

  const r = await recordDeal({
    adminTelegramId: userId,
    thb, usdt, sellRate, roomName,
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

  await sendMessage(
    chatId,
    UI.ledgerCard({
      incomingList: led.incomingList,
      outgoingList: led.outgoingList,
      totalThb: led.totalThb,
      totalIncomingUsdt: led.totalIncomingUsdt,
      totalOutgoingUsdt: led.totalOutgoingUsdt,
      fixedRate: sellRate,
      feePercent: 0,
      netProfitThb: led.netProfitThb,
      lastAdminName: led.lastAdminName,
    }),
  );
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

  // ----- dealok:<ledgerRef> : ยืนยันดีล → บันทึกจริง -----
  if (action === 'dealok') {
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

  // ----- dealedit : แก้ USDT (รอรับใหม่) -----
  if (action === 'dealedit') {
    const session = await getSession(chatId, userId);
    if (!session || session.state !== 'WAITING_USDT') {
      return await answerCallback(id, 'รายการหมดอายุ');
    }
    await answerCallback(id, '✏️ แก้ USDT');
    // ล้างค่า USDT เดิม (รวม cross-check state) แล้วรอรับใหม่
    await setSession(chatId, userId, {
      ...dealSessionFields(session),
      state: 'WAITING_USDT',
      pending_usdt: null, usdt_network: null, usdt_txid: null, usdt_image_url: null,
    });
    await sendMessage(chatId, { text: '⏳ ส่ง <b>สกรีนช็อต USDT</b> ใหม่ หรือพิมพ์ <b>จำนวน USDT</b>' });
    return;
  }

  // ----- cancelop : ยกเลิกก่อนยืนยัน -----
  if (action === 'cancelop') {
    await clearSession(chatId, userId);
    await answerCallback(id, 'ยกเลิกแล้ว');
    await sendMessage(chatId, UI.cancelled());
    return;
  }

  // ----- newday : เริ่มวันใหม่ (day-cut) → รีเซ็ตยอดสรุปของห้อง -----
  if (action === 'newday') {
    await answerCallback(id, '🔄 เริ่มวันใหม่');
    await startNewDay(chatId);
    const label = new Date().toLocaleString('th-TH', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Bangkok',
    });
    await sendMessage(chatId, UI.newDayStarted(label));
    return;
  }

  const txId = arg;

  // ตรวจว่าคนกดปุ่มเป็นเจ้าของธุรกรรมนี้
  const { data: tx } = await supabaseAdmin
    .from('transactions')
    .select('id, type, admins(telegram_user_id, name)')
    .eq('id', txId)
    .single<{ id: string; type: 'THB_DEPOSIT' | 'USDT_SEND'; admins: { telegram_user_id: number; name: string } | null }>();
  if (!tx || tx.admins?.telegram_user_id !== userId) {
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
