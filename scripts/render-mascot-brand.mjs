// Render CE EMPIRE avatar + banner จาก official CE mascot (scripts/ce-mascot.mjs)
// "One Mascot": avatar/banner ต้องเป็นหุ่นมงกุฎทองตัวเดียวกับ animation WEBM
// ตามกฎใน docs/mascot-motion-lock.md (ห้าม fork ตัวละครต่อพื้นผิว)
// เขียนทับ assets/brand/avatar-512.png + banner-1200x630.png (PNG NOVA เก่ายังอยู่ใน git history)
// Usage: npm i -D sharp && node scripts/render-mascot-brand.mjs
// หลังรัน: commit PNG ใหม่ แล้วตั้ง avatar ผ่าน @BotFather /setuserpic
// หรือ BOT_TOKEN=... node scripts/set-bot-avatar.mjs
import { mkdirSync, writeFileSync } from 'fs';
import { ceRobotSvg } from './ce-mascot.mjs';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('✗ ต้องติดตั้ง sharp ก่อน: npm i -D sharp');
  process.exit(1);
}

const OUT = 'assets/brand';
mkdirSync(OUT, { recursive: true });

async function renderPng(name, svg, expectedW, expectedH) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(buf).metadata();
  if (meta.width !== expectedW || meta.height !== expectedH) {
    console.error(`✗ ${name}: ได้ ${meta.width}x${meta.height} แต่ต้องเป็น ${expectedW}x${expectedH}`);
    process.exit(1);
  }
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(`${name}`, buf.length, 'bytes', `(${expectedW}x${expectedH})`);
}

// ── Avatar: 512x512 — bot profile photo (@BotFather /setuserpic หรือ set-bot-avatar.mjs) ──
async function renderAvatar() {
  const size = 512;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#15222E"/>
        <stop offset="100%" stop-color="#090E14"/>
      </radialGradient>
      <radialGradient id="glowG" cx="50%" cy="62%" r="55%">
        <stop offset="0%" stop-color="#F0B429" stop-opacity=".20"/>
        <stop offset="100%" stop-color="#F0B429" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowC" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#00D4FF" stop-opacity=".14"/>
        <stop offset="100%" stop-color="#00D4FF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="512" height="512" fill="url(#bg)"/>
    <circle cx="256" cy="310" r="225" fill="url(#glowG)"/>
    <circle cx="256" cy="256" r="238" fill="none" stroke="#F0B429" stroke-width="6" opacity=".55"/>
    <circle cx="256" cy="256" r="226" fill="none" stroke="#00D4FF" stroke-width="2" stroke-dasharray="8 12" opacity=".35"/>
    <g transform="translate(28,8) scale(5.2)">
      ${ceRobotSvg('happy', { armL: 12, armR: -20 })}
    </g>
  </svg>`;
  await renderPng('avatar-512.png', svg, 512, 512);
}

// ── Banner: 1200x630 (OG-image-like) สำหรับ README / pinned post / social ──
async function renderBanner() {
  const w = 1200;
  const h = 630;
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0C1520"/>
        <stop offset="100%" stop-color="#080D13"/>
      </linearGradient>
      <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#E4F4FC"/>
        <stop offset="55%" stop-color="#FFD766"/>
        <stop offset="100%" stop-color="#00D4FF"/>
      </linearGradient>
      <radialGradient id="glowR" cx="85%" cy="30%" r="60%">
        <stop offset="0%" stop-color="#00D4FF" stop-opacity=".16"/>
        <stop offset="100%" stop-color="#00D4FF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowG" cx="8%" cy="95%" r="55%">
        <stop offset="0%" stop-color="#F0B429" stop-opacity=".14"/>
        <stop offset="100%" stop-color="#F0B429" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glowR)"/>
    <rect width="${w}" height="${h}" fill="url(#glowG)"/>

    <text x="70" y="230" font-family="Segoe UI, Arial, sans-serif" font-size="72" font-weight="900" fill="url(#title)">CE VAULT</text>
    <text x="72" y="272" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4" fill="#C9D8E4">USDT EXCHANGE ASSISTANT</text>

    <g font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1.5" fill="#E4F4FC">
      <rect x="72" y="310" width="132" height="34" rx="8" fill="none" stroke="#00E676" stroke-opacity=".4"/>
      <text x="94" y="332">10–15 MIN</text>
      <rect x="220" y="310" width="104" height="34" rx="8" fill="none" stroke="#00E676" stroke-opacity=".4"/>
      <text x="242" y="332">24/7</text>
      <rect x="340" y="310" width="172" height="34" rx="8" fill="none" stroke="#00E676" stroke-opacity=".4"/>
      <text x="362" y="332">SAFE &amp; SECURE</text>
      <rect x="528" y="310" width="150" height="34" rx="8" fill="none" stroke="#00E676" stroke-opacity=".4"/>
      <text x="550" y="332">BEST RATE</text>
    </g>

    <g transform="translate(838,64) scale(4.6)">
      ${ceRobotSvg('happy', { armL: 14, armR: -24 })}
    </g>
  </svg>`;
  await renderPng('banner-1200x630.png', svg, 1200, 630);
}

await renderAvatar();
await renderBanner();
console.log('✓ brand assets อัปเดตจาก CE mascot แล้ว — อย่าลืม commit PNG และตั้ง avatar ใหม่');
