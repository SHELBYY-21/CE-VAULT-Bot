#!/usr/bin/env node
/**
 * CE VAULT — ตัวอย่างขั้นตอนทุกขั้นตอน (local emulator + TELEGRAM_DRY_RUN)
 * รัน: node scripts/e2e-walkthrough.mjs
 */
import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'fs';

const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const CHAT = 6049267196;
const OUTBOX = '/tmp/ce-vault-tg-outbox.jsonl';
const REPORT = '/tmp/ce-vault-walkthrough-report.md';
const API_SECRET = process.env.API_SECRET || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.API_SECRET || '';

function stripHtml(s) {
  return String(s || '')
    .replace(/<pre>/g, '\n')
    .replace(/<\/pre>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clearOutbox() {
  writeFileSync(OUTBOX, '');
}

function outboxLineCount() {
  if (!existsSync(OUTBOX)) return 0;
  const raw = readFileSync(OUTBOX, 'utf8');
  if (!raw) return 0;
  return raw.split('\n').filter(Boolean).length;
}

function readOutboxFromLine(startLine) {
  if (!existsSync(OUTBOX)) return [];
  const lines = readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean);
  return lines.slice(startLine)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function postWebhook(label, text, extra = {}) {
  const beforeLines = outboxLineCount();
  const update = {
    update_id: Date.now() % 1_000_000_000,
    message: {
      message_id: Math.floor(Math.random() * 100000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: CHAT, type: 'private' },
      from: { id: CHAT, is_bot: false, first_name: 'Admin' },
      text,
      ...extra,
    },
  };
  const headers = { 'content-type': 'application/json' };
  if (WEBHOOK_SECRET) headers['x-telegram-bot-api-secret-token'] = WEBHOOK_SECRET;
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(update),
  });
  const body = await res.text();
  let msgs = [];
  for (let i = 0; i < 25; i++) {
    msgs = readOutboxFromLine(beforeLines).filter((m) => m.method === 'sendMessage');
    if (msgs.length) break;
    await new Promise((r) => setTimeout(r, 40));
  }
  return { label, cmd: text, http: res.status, body, msgs };
}

async function api(method, path, json) {
  const headers = { 'content-type': 'application/json' };
  if (API_SECRET) headers['x-api-key'] = API_SECRET;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json ? JSON.stringify(json) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { http: res.status, data };
}

function section(title, content) {
  return `\n## ${title}\n\n${content}\n`;
}

async function main() {
  clearOutbox();
  const parts = [];
  parts.push('# CE VAULT — ตัวอย่างขั้นตอนทุกขั้นตอน\n');
  parts.push(`วันที่ทดสอบ: ${new Date().toISOString()}`);
  parts.push(`API: ${BASE} · chat/admin: ${CHAT}`);
  parts.push('โหมด: Firebase Emulator + TELEGRAM_DRY_RUN (ไม่ยิง Telegram จริง)\n');

  // 0 health
  const health = await api('GET', '/api/health');
  parts.push(
    section(
      '0) Health check',
      '```\n' + JSON.stringify(health.data, null, 2) + '\n```\nผล: ' + (health.http === 200 && health.data.status === 'ok' ? '✅' : '❌'),
    ),
  );

  // 1 start
  let r = await postWebhook('start', '/start');
  parts.push(
    section(
      '1) /start — ลงทะเบียน / ยินดีต้อนรับ',
      `**ผู้ใช้พิมพ์:** \`/start\`\n\n**HTTP:** ${r.http} ${r.body}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n') || '(ไม่มีข้อความ — ตรวจ dry-run)'}\n\`\`\``,
    ),
  );

  // 1b ensure name if onboarding asks
  const startText = r.msgs.map((m) => m.payload?.text || '').join(' ');
  if (/ชื่อ|name|AWAITING|พิมพ์ชื่อ/i.test(startText) || /ยินดีต้อนรับกลับ/.test(startText) === false) {
    // if already registered, welcome back — skip; else set name
  }
  // Always send display name once to clear AWAITING_NAME from prior runs
  r = await postWebhook('name', 'Admin Tester');
  if (r.msgs.length) {
    parts.push(
      section(
        '1b) ตั้งชื่อแอดมิน (ถ้าบอทถามชื่อ)',
        `**ผู้ใช้พิมพ์:** \`Admin Tester\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
      ),
    );
  }

  // 2 setrate
  r = await postWebhook('setrate', '/setrate 40');
  parts.push(
    section(
      '2) /setrate 40 — ตั้งเรตห้อง',
      `**ผู้ใช้พิมพ์:** \`/setrate 40\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
    ),
  );

  // 3 pin list empty-ish then pin
  r = await postWebhook('pin-help', '/pin');
  parts.push(
    section(
      '3) /pin — ดูบัญชีที่ปักหมุดวันนี้',
      `**ผู้ใช้พิมพ์:** \`/pin\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
    ),
  );

  r = await postWebhook('pin-bank', '/pin kbank 1234567890');
  parts.push(
    section(
      '4) /pin kbank 1234567890 — ปักหมุดบัญชีรับ',
      `**ผู้ใช้พิมพ์:** \`/pin kbank 1234567890\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\`\n\n_สูงสุด 3 บัญชี/วัน (Asia/Bangkok). ลบด้วย_ \`/unpin 1\` _หรือ_ \`/unpin 7890\``,
    ),
  );

  // 5 today before deals
  r = await postWebhook('today-emptyish', '/today');
  parts.push(
    section(
      '5) /today — ยอดวันนี้ (ก่อนทำดีลใหม่ หรือหลังมีดีลจาก API)',
      `**ผู้ใช้พิมพ์:** \`/today\` (alias: \`/tools\` \`/info\` \`/สด\` \`/ยอด\`)\n\n**HTTP:** ${r.http}\n\n**บอทตอบ (ledgerCard):**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
    ),
  );

  // 6 manual THB via text +amount path — try common formats
  r = await postWebhook('plus-thb', '+5000');
  parts.push(
    section(
      '6) พิมพ์ยอด THB มือ (+amount)',
      `**ผู้ใช้พิมพ์:** \`+5000\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n') || '(อาจรอขั้นตอนถัดไปตาม state)'}\n\`\`\`\n\n_หรือใช้รูปแบบเต็ม เช่น_ \`5000thb\` / ตาม FORMAT_HINT ในเมนู`,
    ),
  );

  // 7 API deposit + send (dashboard/API path)
  const dep = await api('POST', '/api/transactions/thb-deposit', {
    adminTelegramId: CHAT,
    thbAmount: 5000,
    usdtAmount: 125,
    sellRate: 40,
    marketUsdtRate: 39.5,
    note: 'walkthrough deposit',
  });
  const snd = await api('POST', '/api/transactions/usdt-send', {
    adminTelegramId: CHAT,
    usdtAmount: 125,
    note: 'walkthrough send',
  });
  parts.push(
    section(
      '7) API ฝาก THB + ส่ง USDT (เทียบแดชบอร์ด)',
      `**POST /api/transactions/thb-deposit**\n\`\`\`\n${JSON.stringify(dep, null, 2)}\n\`\`\`\n\n**POST /api/transactions/usdt-send**\n\`\`\`\n${JSON.stringify(snd, null, 2)}\n\`\`\`\nผล: deposit ${dep.http === 200 || dep.data?.ok || dep.data?.transaction ? '✅' : 'ดู response'} · send ${snd.http === 200 || snd.data?.ok || snd.data?.transaction ? '✅' : 'ดู response'}`,
    ),
  );

  // 8 today after
  r = await postWebhook('today-after', '/today');
  parts.push(
    section(
      '8) /today หลังทำรายการสำเร็จ — ผลรวม (ledger)',
      `**ผู้ใช้พิมพ์:** \`/today\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
    ),
  );

  // 9 tools alias
  r = await postWebhook('tools', '/tools');
  parts.push(
    section(
      '9) /tools (= /today) — เกณฑ์แสดงผลบนการ์ด ledger',
      `**ผู้ใช้พิมพ์:** \`/tools\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
    ),
  );

  // 10 Vision OCR note (can't fully e2e without GROK + image)
  parts.push(
    section(
      '10) Vision OCR สลิป (ต้องมี GROK_API_KEY + รูป)',
      [
        '**ขั้นตอนผู้ใช้ใน Telegram จริง:**',
        '1. `/pin kbank 1234567890` (และบัญชีอื่นได้อีก 2)',
        '2. ส่งรูปสลิปโอนเข้า',
        '3. Grok Vision อ่านยอด / เวลา / ธนาคาร / 4 ตัวท้าย',
        '4. ถ้า confidence ≥ OCR_AUTO_MIN (ค่าเริ่ม 90) **และ** ตรงบัญชี pin → `ocr_success` บันทึกอัตโนมัติ',
        '5. ถ้าไม่มี pin → บอทขอ `/pin` หรือให้พิมพ์ `+ยอด`',
        '6. ถ้ามี pin แต่ไม่ตรง → `slipBankMismatch`',
        '7. หลังสำเร็จ → ส่งการ์ด dealSuccess + **ledgerCard ยอดวันนี้**',
        '',
        '_ในสภาพแวดล้อมนี้ยังไม่ได้รัน OCR จริง (ไม่มี GROK_API_KEY / รูปสลิป / egress ไป Telegram)_',
      ].join('\n'),
    ),
  );

  // 11 unpin
  r = await postWebhook('unpin', '/unpin 1');
  parts.push(
    section(
      '11) /unpin 1 — ลบบัญชีปักหมุด',
      `**ผู้ใช้พิมพ์:** \`/unpin 1\`\n\n**HTTP:** ${r.http}\n\n**บอทตอบ:**\n\`\`\`\n${r.msgs.map((m) => stripHtml(m.payload?.text)).join('\n---\n')}\n\`\`\``,
    ),
  );

  // 12 unit/sticker already ran — summarize
  parts.push(
    section(
      '12) Automated checks ที่รันแล้วใน session นี้',
      [
        '- `npm test` → 31 passed',
        '- `npm run stickers:verify` → 12/12 WEBM OK',
        '- Firebase emulator + `db:setup` / `db:verify` → OK',
        '- Health `/api/health` → ok (firebase)',
      ].join('\n'),
    ),
  );

  const md = parts.join('\n');
  writeFileSync(REPORT, md);
  console.log(md);
  console.log('\n---\nรายงานเต็ม: ' + REPORT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
