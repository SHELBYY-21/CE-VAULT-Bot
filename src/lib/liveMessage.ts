import { supabaseAdmin } from './supabaseAdmin';
import { sendMessage, editMessage, sendSticker } from './telegram';
import * as UI from './botUi';
import { setSession, getSession } from './botSessions';
import { getSticker, type StickerState } from '@/config/stickers';

type CreateOpts = {
  transactionId: string;
  chatId: number;
  userId?: number;
  ledgerRef: string;
  adminName?: string | null;
};

export default class LiveMessageService {
  // Create initial live message (returns message id)
  static async create(opts: CreateOpts): Promise<{ liveMessageId: number | null }> {
    const { transactionId, chatId, userId, ledgerRef, adminName } = opts;
    try {
      const msgId = await sendMessage(chatId, UI.liveInitial(ledgerRef, adminName ?? undefined));
      // persist in sessions (best-effort)
      try {
        if (userId) await setSession(chatId, userId, { live_message_id: msgId, live_tx_id: transactionId });
      } catch (e) {
        // ignore
      }
      // persist in transactions table (best-effort)
      try {
        await supabaseAdmin.from('transactions').update({ live_message_id: msgId, live_chat_id: chatId, live_status: 'Receiving', updated_at: new Date().toISOString() }).eq('id', transactionId);
        await supabaseAdmin.from('transaction_status_logs').insert({ transaction_id: transactionId, status: 'Receiving', meta: { ledgerRef } });
      } catch (e) {
        // ignore DB failures
      }

      // Send a sticker for receiving state if configured
      try {
        const st = getSticker('PROCESSING');
        if (st) await sendSticker(chatId, st);
      } catch (e) {
        // ignore
      }

      return { liveMessageId: msgId };
    } catch (e) {
      // failed to create live message
      return { liveMessageId: null };
    }
  }

  static async update(transactionId: string, chatId: number, messageId: number, status: string, m: { text: string }): Promise<void> {
    // edit message
    try {
      await editMessage(chatId, messageId, { text: m.text });
    } catch (e) {
      // ignore edit failures
    }
    // persist status
    try {
      await supabaseAdmin.from('transactions').update({ live_status: status, updated_at: new Date().toISOString() }).eq('id', transactionId);
      await supabaseAdmin.from('transaction_status_logs').insert({ transaction_id: transactionId, status, meta: { message: m.text } });
    } catch (e) {
      // ignore
    }
    // try sticker by status (map known keys)
    try {
      const stickerKey = mapStatusToStickerKey(status);
      const stickerId = stickerKey ? getSticker(stickerKey) : undefined;
      if (stickerId) await sendSticker(chatId, stickerId);
    } catch (e) {
      // ignore
    }
  }

  static async complete(transactionId: string, chatId: number, messageId: number, payload: any): Promise<void> {
    const text = UI.liveCompleted({
      ledgerRef: payload.ledgerRef,
      thb: payload.thb,
      usdt: payload.usdt,
      profitThb: payload.profitThb ?? 0,
      remaining: payload.remaining ?? 0,
      todayTotalThb: payload.todayTotalThb ?? undefined,
    }).text;
    await this.update(transactionId, chatId, messageId, 'Completed', { text });
  }

  static async error(transactionId: string, chatId: number, messageId: number, errMsg: string): Promise<void> {
    const text = `${UI.BRAND || ''}\n${UI.THIN || ''}\n<b>Error</b> ${uiSafe(errMsg)}`;
    try {
      await editMessage(chatId, messageId, { text });
    } catch (e) {
      // ignore
    }
    try {
      await supabaseAdmin.from('transactions').update({ live_status: 'Error', updated_at: new Date().toISOString() }).eq('id', transactionId);
      await supabaseAdmin.from('transaction_status_logs').insert({ transaction_id: transactionId, status: 'Error', meta: { error: errMsg } });
    } catch (e) {
      // ignore
    }
  }
}

function uiSafe(s: any) {
  if (s == null) return '';
  return String(s).slice(0, 4000);
}

function mapStatusToStickerKey(status: string): StickerState | undefined {
  const normalized = (status || '').toUpperCase().replace(/\s+/g, '_');
  switch (normalized) {
    case 'RECEIVING':
      return 'PROCESSING';
    case 'OCR':
    case 'VERIFIED':
      return 'OCR_DONE';
    case 'WAITING_USDT':
    case 'WAITING':
      return 'WAITING';
    case 'PROCESSING':
      return 'PROCESSING';
    case 'COMPLETED':
    case 'SUCCESS':
      return 'SUCCESS';
    case 'ERROR':
      return 'ERROR';
    case 'RETRY':
      return 'RETRY';
    default:
      return undefined;
  }
}
