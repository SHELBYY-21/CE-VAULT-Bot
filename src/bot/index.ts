import 'dotenv/config';
import { Telegraf, Context } from 'telegraf';
import { handleMessage } from './slipHandler';
import { handleCallback } from './callbacks';
import { initAdminStore, isAdmin, addAdmin } from './admin';
import { setBotCommands } from './menus';
import * as UI from '../lib/botUi';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Error: BOT_TOKEN environment variable is not defined.');
  process.exit(1);
}

const bot = new Telegraf(token);

async function bootstrap() {
  await initAdminStore();
  await setBotCommands(bot);

  // /start command
  bot.start(async (ctx: Context) => {
    const from = ctx.from;
    if (!from) return;
    const uname = from.username || from.first_name || 'User';
    if (!isAdmin(from.id) && !isAdmin(uname)) {
      const msg = UI.askName();
      await ctx.replyWithHTML(msg.text);
      return;
    }
    const msg = UI.welcomeRegistered(uname);
    await ctx.replyWithHTML(msg.text, { reply_markup: msg.reply_markup as any });
  });

  // /register command
  bot.command('register', async (ctx: Context) => {
    const from = ctx.from;
    if (!from) return;
    const uname = from.username || from.first_name || String(from.id);
    await addAdmin(uname, from.id);
    const msg = UI.welcomeRegistered(uname);
    await ctx.replyWithHTML(msg.text, { reply_markup: msg.reply_markup as any });
  });

  // /help command
  bot.command('help', async (ctx: Context) => {
    const msg = UI.menuCard();
    await ctx.replyWithHTML(msg.text);
  });

  // /menu command
  bot.command('menu', async (ctx: Context) => {
    const msg = UI.menuCard();
    await ctx.replyWithHTML(msg.text);
  });

  // Callback queries
  bot.on('callback_query', async (ctx: Context) => {
    await handleCallback(ctx);
  });

  // Messages (text, photos)
  bot.on('message', async (ctx: Context) => {
    await handleMessage(ctx);
  });

  bot.launch().then(() => {
    console.log('🤖 CE VAULT Telegram Bot (Version 2) is running...');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Failed to start CE VAULT Bot:', err);
});
