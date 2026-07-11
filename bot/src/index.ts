// ============================================================
// CE VAULT — Dev Bridge (ใช้เฉพาะตอนพัฒนาในเครื่อง)
// โปรดักชันใช้ Webhook บน Vercel — logic ทั้งหมดอยู่ที่ app/api/telegram/webhook
// สคริปต์นี้แค่ long-poll getUpdates แล้ว forward เข้า webhook local
// (จะได้ทดสอบบอทในเครื่องโดยไม่ต้องมี public URL / ngrok)
// ============================================================
import 'dotenv/config';
import axios from 'axios';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const WEBHOOK_URL = process.env.LOCAL_WEBHOOK_URL || 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET || '';
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;

async function poll(): Promise<void> {
  try {
    const { data } = await axios.get(`${TG}/getUpdates`, {
      params: {
        offset,
        timeout: 30,
        allowed_updates: JSON.stringify(['message', 'edited_message', 'callback_query']),
      },
      timeout: 35000,
    });
    for (const update of data.result) {
      offset = update.update_id + 1;
      axios
        .post(WEBHOOK_URL, update, {
          headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token': SECRET,
          },
        })
        .catch((e) => console.error('forward error:', e?.response?.status || e.message));
    }
  } catch (e: any) {
    console.error('poll error:', e?.message);
    await new Promise((r) => setTimeout(r, 2000));
  }
  poll();
}

async function main() {
  if (!BOT_TOKEN) throw new Error('กรุณาตั้งค่า BOT_TOKEN ใน bot/.env');
  await axios.get(`${TG}/deleteWebhook`).catch(() => undefined); // ปิด webhook เพื่อให้ getUpdates ทำงาน
  console.log('🌉 CE VAULT dev bridge → forward updates ไปที่', WEBHOOK_URL);
  poll();
}

main();
