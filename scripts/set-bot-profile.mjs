#!/usr/bin/env node
/**
 * ตั้งชื่อ / About / Description / คำสั่ง ของบอทผ่าน Bot API
 * Usage: BOT_TOKEN=... node scripts/set-bot-profile.mjs
 */
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN required');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`${method}: ${json.description || JSON.stringify(json)}`);
  }
  return json.result;
}

const NAME = '[CE] บัญชีหนังหมา📊';
const ABOUT =
  'CE VAULT\n\nUSDT EXCHANGE\n\n24/7\n\nFAST • SAFE • TRUSTED';
const DESCRIPTION = '欢迎\n\nWelcome to\n\nCE VAULT';

/** 12 คำสั่งหลักที่บอทรองรับ */
const COMMANDS = [
  { command: 'start', description: 'เริ่มใช้งาน / ยินดีต้อนรับ' },
  { command: 'help', description: 'คู่มือใช้งาน CE VAULT' },
  { command: 'menu', description: 'เมนูคำสั่ง' },
  { command: 'today', description: 'ยอดห้องนี้วันนี้' },
  { command: 'newday', description: 'เริ่มวันใหม่ (ตัดยอด)' },
  { command: 'reset', description: 'ล้างยอดห้องนี้' },
  { command: 'setrate', description: 'ตั้งเรตขายห้อง — /setrate 40' },
  { command: 'rate', description: 'เรตตลาด Binance TH' },
  { command: 'receiver', description: 'ประวัติผู้รับ — /receiver 6578' },
  { command: 'cancel', description: 'ยกเลิกรายการที่ค้าง' },
  { command: 'export', description: 'ดาวน์โหลด CSV ยอดห้อง' },
  { command: 'setroom', description: 'ตั้งชื่อห้อง — /setroom ชื่อ' },
];

async function main() {
  const me = await tg('getMe');
  console.log('bot:', me.username, me.id);

  await tg('setMyName', { name: NAME });
  console.log('name →', NAME);

  await tg('setMyShortDescription', { short_description: ABOUT });
  console.log('about → ok');

  await tg('setMyDescription', { description: DESCRIPTION });
  console.log('description → ok');

  await tg('setMyCommands', { commands: COMMANDS });
  console.log('commands →', COMMANDS.length);

  const [name, about, desc, cmds] = await Promise.all([
    tg('getMyName'),
    tg('getMyShortDescription'),
    tg('getMyDescription'),
    tg('getMyCommands'),
  ]);
  console.log(JSON.stringify({ name, about, description: desc, commands: cmds.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
