// Render CE VAULT avatar + banner เป็น PNG จริงจาก NOVA SVG (brandkit-test.html)
// Usage: node scripts/render-brand-assets.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { novaFrame, ceMarkSvg } from './nova.mjs';

const OUT = 'assets/brand';
mkdirSync(OUT, { recursive: true });

// ── Avatar: 512x512, square (ใช้เป็น bot profile photo ผ่าน @BotFather /setuserpic) ──
async function renderAvatar() {
  const size = 512;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#132029"/>
        <stop offset="100%" stop-color="#0a0f14"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="60%" r="55%">
        <stop offset="0%" stop-color="#00e676" stop-opacity=".22"/>
        <stop offset="100%" stop-color="#00e676" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="512" height="512" fill="url(#bg)"/>
    <circle cx="256" cy="300" r="220" fill="url(#glow)"/>
    <circle cx="256" cy="256" r="238" fill="none" stroke="#00d8ff" stroke-width="6" opacity=".55"/>
    <g transform="translate(60,50) scale(4.9)">
      ${(() => {
        // novaFrame ให้ทั้งเอกสาร <svg> ครบ — ดึงเฉพาะ inner <g> ออกมาแปะซ้อน
        const inner = novaFrame({ size: 88, exp: 'happy' });
        return inner.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      })()}
    </g>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(`${OUT}/avatar-512.png`, buf);
  console.log('avatar-512.png', buf.length, 'bytes');
}

// ── Banner: 1200x630 (OG-image-like) สำหรับ README / pinned post / social — ไม่ใช่ฟีเจอร์ Telegram โดยตรง ──
async function renderBanner() {
  const w = 1200, h = 630;
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0c1420"/>
        <stop offset="100%" stop-color="#0a1016"/>
      </linearGradient>
      <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#e8f6f2"/>
        <stop offset="55%" stop-color="#00e676"/>
        <stop offset="100%" stop-color="#00d8ff"/>
      </linearGradient>
      <radialGradient id="glowR" cx="85%" cy="30%" r="60%">
        <stop offset="0%" stop-color="#00d8ff" stop-opacity=".16"/>
        <stop offset="100%" stop-color="#00d8ff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowL" cx="8%" cy="95%" r="55%">
        <stop offset="0%" stop-color="#00e676" stop-opacity=".14"/>
        <stop offset="100%" stop-color="#00e676" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glowR)"/>
    <rect width="${w}" height="${h}" fill="url(#glowL)"/>

    <text x="70" y="230" font-family="Segoe UI, Arial, sans-serif" font-size="72" font-weight="900" fill="url(#title)">CE VAULT</text>
    <text x="72" y="272" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4" fill="#cfe9e4">USDT EXCHANGE ASSISTANT</text>

    <g font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1.5" fill="#eaf7f4">
      <rect x="72" y="310" width="132" height="34" rx="8" fill="none" stroke="#00e676" stroke-opacity=".4"/>
      <text x="94" y="332">10–15 MIN</text>
      <rect x="220" y="310" width="104" height="34" rx="8" fill="none" stroke="#00e676" stroke-opacity=".4"/>
      <text x="242" y="332">24/7</text>
      <rect x="340" y="310" width="172" height="34" rx="8" fill="none" stroke="#00e676" stroke-opacity=".4"/>
      <text x="362" y="332">SAFE &amp; SECURE</text>
      <rect x="528" y="310" width="150" height="34" rx="8" fill="none" stroke="#00e676" stroke-opacity=".4"/>
      <text x="550" y="332">BEST RATE</text>
    </g>

    <g transform="translate(830,120) scale(5.4)">
      ${(() => {
        const inner = novaFrame({ size: 88, exp: 'wink' });
        return inner.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      })()}
    </g>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(`${OUT}/banner-1200x630.png`, buf);
  console.log('banner-1200x630.png', buf.length, 'bytes');
}

await renderAvatar();
await renderBanner();
