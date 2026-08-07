import { Telegraf } from 'telegraf';

export async function setBotCommands(bot: Telegraf) {
  await bot.telegram.setMyCommands([
    { command: 'help', description: 'ช่วยเหลือและวิธีใช้งาน' },
    { command: 'menu', description: 'เมนูหลัก CE VAULT' },
    { command: 'today', description: 'ดูสรุปยอดประจำวันนี้' },
    { command: 'rate', description: 'เช็ค/ตั้งเรตแลกเปลี่ยน' },
    { command: 'register', description: 'ลงทะเบียนผู้ดูแลระบบ' },
    { command: 'cancel', description: 'ยกเลิกรายการค้าง' },
  ]);
}
