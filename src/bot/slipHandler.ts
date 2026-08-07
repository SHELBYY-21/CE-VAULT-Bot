import { Context } from 'telegraf';
import { runOCR } from './ocr';
import { parseWithGrok } from './grok';
import { parseSlipText, computeShouldSend } from './parse';
import { persistSlip, logAction } from './store';
import * as UI from '../lib/botUi';

export async function handleMessage(ctx: Context): Promise<void> {
  try {
    const msg = ctx.message;
    if (!msg) return;

    const userId = ctx.from?.id || 0;
    const username = ctx.from?.username || ctx.from?.first_name || 'unknown';

    // Handle photo attachment (slip)
    if ('photo' in msg && Array.isArray(msg.photo) && msg.photo.length > 0) {
      const photos = msg.photo;
      const largest = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(largest.file_id);
      const imageUrl = fileLink.toString();

      // 1. Run Grok parser (or fall back to OCR + regex parser)
      let grokResult = await parseWithGrok(imageUrl);
      let amount = grokResult?.amount || null;
      let bank = grokResult?.bank || null;
      let last4 = grokResult?.receiverLast4 || null;
      let receiverName = grokResult?.receiverName || null;
      let confidence = grokResult?.confidence || 90;

      if (!amount) {
        // Fallback to local OCR + regex parser
        try {
          const res = await fetch(imageUrl);
          const buffer = Buffer.from(await res.arrayBuffer());
          const ocrText = await runOCR(buffer);
          const parsed = parseSlipText(ocrText);
          amount = parsed.amount;
          bank = parsed.bank;
          last4 = parsed.last4;
          receiverName = parsed.receiverName;
          confidence = 70;
        } catch (e) {
          console.warn('Local OCR fallback failed:', e);
        }
      }

      const slipId = `slip_${Date.now()}`;
      await persistSlip({
        id: slipId,
        telegramUserId: userId,
        username,
        thbAmount: amount,
        bank,
        last4,
        receiverName,
        confidence,
        status: 'PENDING_USDT',
        createdAt: new Date().toISOString(),
      });

      await logAction(userId, username, 'UPLOAD_SLIP', `Amount: ${amount || 'N/A'}`);

      const roomRate = 35.5; // default rate
      const messageUi = UI.waitUsdt({
        thb: amount,
        bank,
        last4,
        receiverName,
        confidence,
        ledgerRef: UI.newLedgerRef(),
        roomRate,
      });

      await ctx.replyWithHTML(messageUi.text, { reply_markup: messageUi.reply_markup as any });
      return;
    }

    // Handle text messages
    if ('text' in msg && msg.text) {
      const text = msg.text.trim();
      if (text.startsWith('/')) return; // ignore command handlers

      if (text.toLowerCase() === 'ping') {
        await ctx.reply('pong 🏓');
        return;
      }
    }
  } catch (err: any) {
    console.error('handleMessage error:', err?.message || err);
  }
}
