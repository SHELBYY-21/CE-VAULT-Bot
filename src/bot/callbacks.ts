import { Context } from 'telegraf';
import { logAction } from './store';

export async function handleCallback(ctx: Context): Promise<void> {
  try {
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const userId = ctx.from?.id || 0;
    const username = ctx.from?.username || ctx.from?.first_name || 'unknown';

    if (!data) return;

    if (data.startsWith('confirm:')) {
      const usdt = data.split(':')[1];
      await logAction(userId, username, 'CONFIRM_DEPOSIT', `USDT: ${usdt}`);
      await ctx.answerCbQuery('✅ ยืนยันรายการเรียบร้อยแล้ว');
      await ctx.reply(`🟢 ยืนยันรายการ ${usdt} USDT เรียบร้อยแล้ว`);
    } else if (data.startsWith('dealok:')) {
      const ref = data.split(':')[1];
      await logAction(userId, username, 'CONFIRM_DEAL', `Ref: ${ref}`);
      await ctx.answerCbQuery('✅ บันทึกดีลเรียบร้อย');
      await ctx.reply(`✅ ดีล #${ref} ได้รับการยืนยันแล้ว`);
    } else if (data.startsWith('cancelop:')) {
      await logAction(userId, username, 'CANCEL_OPERATION');
      await ctx.answerCbQuery('ยกเลิกรายการแล้ว');
      await ctx.reply('✖️ ยกเลิกการทำรายการแล้ว');
    } else {
      await ctx.answerCbQuery();
    }
  } catch (err: any) {
    console.error('handleCallback error:', err?.message || err);
    try {
      await ctx.answerCbQuery('เกิดข้อผิดพลาด').catch(() => undefined);
    } catch {}
  }
}
