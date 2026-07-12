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
  recordThbDeposit,
  recordUsdtSend,
  editTransaction,
  deleteTransaction,
  getTodayLedger,
} from '@/lib/transactions';
import { getChatRate, setChatRate } from '@/lib/botSessions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { notifyDailySummary, notifyReady } from '@/lib/notifier';
import { analyzeSlip } from '@/lib/ocr';

export const runtime = 'nodejs';
export const maxDuration = 30; // Vercel serverless max 30s

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET;
const DEFAULT_THB = Number(process.env.DEFAULT_THB || 5000);

const log = (msg: string, data?: any) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, data || '');
};

function detectType(caption: string): 'THB_DEPOSIT' | 'USDT_SEND' {
  const c = (caption || '').toLowerCase();
  if (c.includes('usdt') || c.includes('send') || c.includes('ส่ง') || c.includes('จีน'))
    return 'USDT_SEND';
  return 'THB_DEPOSIT';
}

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
    const [led, rates, chatRate] = await Promise.all([
      getTodayLedger(),
      getLatestRates(),
      getChatRate(chatId),
    ]);
    const feePercent =
      led.totalThb > 0 ? ((led.totalThb - led.totalIncomingUsdt * rates.marketUsdtRate) / led.totalThb) * 100 : 0;
    await sendMessage(
      chatId,
      UI.ledgerCard({
        incomingList: led.incomingList,
        outgoingList: led.outgoingList,
        totalThb: led.totalThb,
        totalIncomingUsdt: led.totalIncomingUsdt,
        totalOutgoingUsdt: led.totalOutgoingUsdt,
        fixedRate: chatRate,
        feePercent,
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

  const session = await getSession(chatId, userId);
  const admin = await getAdminByTelegramId(userId);

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

  // ----- รูปสลิป -----
  if (msg.photo) {
    if (!admin) {
      await setSession(chatId, userId, { state: 'AWAITING_NAME' });
      await sendMessage(chatId, UI.askName());
      return;
    }
    const type = detectType(msg.caption || '');
    const placeholderId = await sendMessage(chatId, UI.uploading(0));
    try {
      const photos = msg.photo;
      const fileId = photos[photos.length - 1].file_id;
      const slipUrl = await uploadSlipFromTelegram(fileId); // เฟรม 1
      await editMessage(chatId, placeholderId, UI.uploading(1)); // เฟรม 2
      // วิเคราะห์สลิปด้วย Grok (ยอด + วันที่ + เวลา + เลข 4 ตัวท้าย + ธนาคาร)
      const slip = type === 'THB_DEPOSIT' ? await analyzeSlip(slipUrl) : null;
      await editMessage(chatId, placeholderId, UI.uploading(2)); // เฟรม 3

      const chatRate = type === 'THB_DEPOSIT' ? await getChatRate(chatId) : null;
      await setSession(chatId, userId, {
        state: 'AWAITING_AMOUNT',
        pending_type: type,
        slip_url: slipUrl,
        caption: msg.caption || '',
        ocr_thb: slip?.thbAmount ?? null,
        slip_date: slip?.date ?? null,
        slip_time: slip?.time ?? null,
        slip_last4: slip?.receiverLast4 ?? null,
        slip_bank: slip?.bank ?? null,
        admin_id: admin?.id,
        admin_name: admin?.name,
      });
      await editMessage(
        chatId,
        placeholderId,
        UI.slipReady({
          type,
          thb: slip?.thbAmount ?? null,
          date: slip?.date ?? null,
          time: slip?.time ?? null,
          last4: slip?.receiverLast4 ?? null,
          bank: slip?.bank ?? null,
          chatRate,
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

  // (ข) รอจำนวน → บันทึกธุรกรรม
  if (session?.state === 'AWAITING_AMOUNT') {
    const nums = parseNums(text);
    if (nums.length === 0) return; // ไม่ใช่ตัวเลข ปล่อยผ่าน
    await clearSession(chatId, userId);
    await sendChatAction(chatId, 'typing');
    const note = session.caption || (session.pending_type === 'USDT_SEND' ? 'ส่ง USDT' : 'ฝาก THB');

    try {
      if (session.pending_type === 'USDT_SEND') {
        const r = await recordUsdtSend({
          adminTelegramId: userId,
          usdtAmount: nums[0],
          note,
          slipImageUrl: session.slip_url || '',
        });
        await sendMessage(
          chatId,
          UI.usdtSendSuccess({
            transactionId: r.transactionId,
            adminName: r.admin.name,
            usdt: nums[0],
            holdingUsdt: r.admin.holdingUsdt,
          }),
        );
      } else {
        // THB_DEPOSIT: ถ้ารู้ยอดจากสลิปแล้ว → เลขที่พิมพ์ = "เรตแลก" (usdt = thb / rate)
        //              ถ้าไม่รู้ยอด → เลข = USDT โดยตรง (หรือ "THB RATE")
        let thbAmount: number;
        let usdtAmount: number;
        let sellRate: number;
        if (session.ocr_thb) {
          thbAmount = nums.length >= 2 ? nums[0] : Number(session.ocr_thb);
          const rate = nums.length >= 2 ? nums[1] : nums[0];
          sellRate = rate;
          usdtAmount = rate > 0 ? thbAmount / rate : 0;
        } else if (nums.length >= 2) {
          thbAmount = nums[0];
          const rate = nums[1];
          sellRate = rate;
          usdtAmount = rate > 0 ? thbAmount / rate : 0;
        } else {
          // ไม่มียอดสลิป + เลขเดียว → เดิม: ถือเป็นเรต, thb = default
          thbAmount = DEFAULT_THB;
          sellRate = nums[0];
          usdtAmount = nums[0] > 0 ? thbAmount / nums[0] : 0;
        }
        await finalizeDeposit(chatId, userId, session, thbAmount, usdtAmount, sellRate, note);
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

/** บันทึกฝาก + ตอบการ์ดสรุป + ledger รวมของวัน */
async function finalizeDeposit(
  chatId: number,
  userId: number,
  session: any,
  thbAmount: number,
  usdtAmount: number,
  sellRate: number,
  note: string,
): Promise<void> {
  const [rates, bankAccountId, led, chatRate] = await Promise.all([
    getLatestRates(),
    getDefaultBankAccountId(),
    getTodayLedger(),
    getChatRate(chatId),
  ]);

  // ผูกข้อมูลสลิป (วันที่/เวลา/ปลายทาง) ลง note
  const meta = [session.slip_date, session.slip_time, session.slip_last4 ? `>>${session.slip_last4}` : '', session.slip_bank]
    .filter(Boolean)
    .join(' ');
  const r = await recordThbDeposit({
    adminTelegramId: userId,
    bankAccountId,
    thbAmount,
    usdtAmount,
    sellRate,
    marketUsdtRate: rates.marketUsdtRate,
    note: meta || note,
    slipImageUrl: session.slip_url || '',
  });

  // การ์ดยืนยันธุรกรรมนี้ (มีปุ่มแก้ไข/ลบ)
  await sendMessage(
    chatId,
    UI.thbSuccess({
      transactionId: r.transactionId,
      adminName: r.admin.name,
      thb: thbAmount,
      usdt: usdtAmount,
      netProfitThb: r.profit.netProfitThb,
      profitPercent: r.profit.profitPercent,
      feeUsdt: r.fee.feeUsdt,
      feePercent: r.fee.feePercent,
      holdingUsdt: r.admin.holdingUsdt,
    }),
  );

  // การ์ดสรุปยอดรวมทั้งวัน (สไตล์ ledger)
  await sendMessage(
    chatId,
    UI.ledgerCard({
      incomingList: led.incomingList,
      outgoingList: led.outgoingList,
      totalThb: led.totalThb,
      totalIncomingUsdt: led.totalIncomingUsdt,
      totalOutgoingUsdt: led.totalOutgoingUsdt,
      fixedRate: chatRate,
      feePercent: r.fee.feePercent,
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

  // ----- confirm:<usdt> : ยืนยันยอด USDT ที่ระบบคำนวณจากเรตห้อง -----
  if (action === 'confirm') {
    const session = await getSession(chatId, userId);
    if (!session || session.state !== 'AWAITING_AMOUNT' || session.pending_type !== 'THB_DEPOSIT') {
      return await answerCallback(id, 'รายการหมดอายุ ส่งสลิปใหม่อีกครั้ง');
    }
    await answerCallback(id, '✅ กำลังบันทึก...');
    await clearSession(chatId, userId);
    const usdt = Number(arg);
    const thb = Number(session.ocr_thb) || 0;
    const sellRate = usdt > 0 ? thb / usdt : 0;
    try {
      await finalizeDeposit(chatId, userId, session, thb, usdt, sellRate, session.caption || 'ฝาก THB');
    } catch (e: any) {
      await sendMessage(chatId, UI.error(e?.message ?? 'record failed'));
    }
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
