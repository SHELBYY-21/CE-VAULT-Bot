// CE VAULT local long-poll bridge. Production uses the Next.js webhook.
import 'dotenv/config';
import axios from 'axios';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.LOCAL_WEBHOOK_URL || 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET || '';

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
let offset = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  // Validate the token before altering the webhook; preserve queued updates.
  await axios.get(`${TG}/getMe`, { timeout: 10000 });
  await axios.post(`${TG}/deleteWebhook`, { drop_pending_updates: false }, { timeout: 10000 });
  console.log('CE VAULT bridge started; forwarding Telegram updates to local webhook');

  while (true) {
    try {
      const { data } = await axios.get(`${TG}/getUpdates`, {
        params: {
          offset,
          timeout: 30,
          allowed_updates: JSON.stringify(['message', 'edited_message', 'callback_query']),
        },
        timeout: 35000,
      });

      for (const update of data.result || []) {
        // Do not advance the Telegram offset until the local webhook accepts the update.
        // Sequential forwarding preserves order and prevents silent loss on network failures.
        await axios.post(WEBHOOK_URL, update, {
          headers: {
            'content-type': 'application/json',
            ...(SECRET ? { 'x-telegram-bot-api-secret-token': SECRET } : {}),
          },
          timeout: 30000,
        });
        offset = update.update_id + 1;
      }
    } catch (error: any) {
      const status = error?.response?.status;
      console.error('Telegram bridge error:', status ? `HTTP ${status}` : error?.message || 'unknown error');
      // Invalid credentials must fail the job rather than retry indefinitely.
      if (status === 401 || status === 403) throw error;
      await sleep(2000);
    }
  }
}

main().catch((error: any) => {
  console.error('Telegram bridge stopped:', error?.response?.status || error?.message || 'unknown error');
  process.exitCode = 1;
});
