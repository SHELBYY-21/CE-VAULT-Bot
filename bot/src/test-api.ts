// ============================================================
// สคริปต์ทดสอบ API โดยไม่ต้องเปิด Telegram
// รัน:  npm run test:api   (ในโฟลเดอร์ bot)
// ต้องมีแอดมินที่ telegram_user_id = TEST_TELEGRAM_ID อยู่ในตาราง admins ก่อน
// ============================================================
import 'dotenv/config';
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET;
const TEST_TELEGRAM_ID = Number(process.env.TEST_TELEGRAM_ID || 111111111);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: API_SECRET ? { 'x-api-key': API_SECRET } : {},
});

async function main() {
  console.log('▶ API_BASE_URL =', API_BASE_URL);
  console.log('▶ API_SECRET   =', API_SECRET ? 'set ✔' : '(ไม่ตั้ง — เปิดโล่ง)');
  console.log('▶ TEST_TELEGRAM_ID =', TEST_TELEGRAM_ID, '\n');

  // 1) health
  const health = await api.get('/api/health');
  console.log('🩺 health:', JSON.stringify(health.data, null, 2), '\n');

  // 2) THB deposit
  const dep = await api.post('/api/transactions/thb-deposit', {
    adminTelegramId: TEST_TELEGRAM_ID,
    bankAccountId: process.env.DEFAULT_BANK_ACCOUNT_ID || null,
    thbAmount: 5000,
    usdtAmount: 11,
    sellRate: 35.5,
    marketUsdtRate: 34.8,
    note: 'ทดสอบจาก test-api',
    slipImageUrl: '',
  });
  console.log('💱 thb-deposit:', JSON.stringify(dep.data, null, 2), '\n');

  // 3) USDT send
  const snd = await api.post('/api/transactions/usdt-send', {
    adminTelegramId: TEST_TELEGRAM_ID,
    usdtAmount: 4,
    note: 'ทดสอบส่ง USDT',
    slipImageUrl: '',
  });
  console.log('🚀 usdt-send:', JSON.stringify(snd.data, null, 2), '\n');

  console.log('✅ ทดสอบครบทุก endpoint สำเร็จ');
}

main().catch((e) => {
  console.error('❌ ล้มเหลว:', e?.response?.status, e?.response?.data || e?.message || e);
  process.exit(1);
});
