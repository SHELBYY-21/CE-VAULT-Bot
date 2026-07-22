#!/usr/bin/env node
/**
 * อัปโหลด Telegram bot profile photo จาก assets/brand/avatar-512.png
 * (Bot API setMyProfilePhoto — ต้องใช้ token จริง + runner ที่เข้าถึง api.telegram.org ได้)
 *
 * Usage: BOT_TOKEN=... node scripts/set-bot-avatar.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN required');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const avatarPath = resolve(
  process.env.AVATAR_PATH || 'assets/brand/avatar-512.png',
);

if (!existsSync(avatarPath)) {
  console.error('missing avatar:', avatarPath);
  process.exit(1);
}

async function main() {
  const png = readFileSync(avatarPath);
  const form = new FormData();
  // Bot API 8.3+: setMyProfilePhoto with InputProfilePhotoStatic via multipart
  form.append(
    'photo',
    new Blob([png], { type: 'image/png' }),
    'avatar-512.png',
  );

  // Newer bots: setMyProfilePhoto expects JSON photo object — try multipart attachment
  const attachForm = new FormData();
  attachForm.append(
    'photo',
    JSON.stringify({ type: 'static', photo: 'attach://file' }),
  );
  attachForm.append(
    'file',
    new Blob([png], { type: 'image/png' }),
    'avatar-512.png',
  );

  let res = await fetch(`${API}/setMyProfilePhoto`, { method: 'POST', body: attachForm });
  let json = await res.json();

  if (!json.ok) {
    // Fallback: some servers accept raw photo file field
    res = await fetch(`${API}/setMyProfilePhoto`, { method: 'POST', body: form });
    json = await res.json();
  }

  if (!json.ok) {
    console.error('setMyProfilePhoto failed:', json.description || json);
    console.error(
      'Fallback: upload public/brand/avatar-512.png via @BotFather → /setuserpic',
    );
    process.exit(1);
  }

  console.log('profile photo updated from', avatarPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
