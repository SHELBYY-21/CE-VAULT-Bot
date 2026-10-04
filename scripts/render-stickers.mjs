// ผลิต animated sticker WEBM จริง (VP9 + alpha) จาก NOVA SVG — ไม่ใช่ mockup
// Usage: node scripts/render-stickers.mjs
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { novaSticker } from './nova.mjs';

const SIZE = 512;
const FPS = 20;
const DURATION_S = 2.4; // loop สั้นกระชับ (สเปก 3-5s แต่ไฟล์เล็กและลูปลื่นกว่าที่ fps/duration นี้)
const FRAMES = Math.round(FPS * DURATION_S);
const OUT_DIR = 'assets/stickers';
const TMP_ROOT = 'assets/.tmp-frames';

mkdirSync(OUT_DIR, { recursive: true });

// ── นิยาม 12 สถานะ: expression หลัก + prop/animation เฉพาะตัว ──
// t = 0..1 (progress ภายในลูป), ให้แต่ละ state คืน extraSvg (parts ที่ขยับ) ต่อเฟรม
const STATES = [
  { key: 'welcome', exp: 'happy', prop: (t) => {
      const wave = Math.sin(t * Math.PI * 4) * 18; // มือโบก
      return `<g transform="translate(300,330) rotate(${wave})"><path d="M0 0 L0 -46" stroke="#FFE8DC" stroke-width="14" stroke-linecap="round"/><circle cx="0" cy="-50" r="11" fill="#FFE8DC"/></g>
        ${sparkle(t, 340, 150)}${sparkle(t + .4, 130, 190)}`;
  }},
  { key: 'ocr_scanning', exp: 'focused', prop: (t) => {
      const y = 130 + (t % 1) * 260;
      return `<rect x="150" y="120" width="212" height="280" rx="12" fill="#0f1c2e" stroke="#00d8ff" stroke-opacity=".5" stroke-width="2"/>
        <rect x="170" y="150" width="150" height="14" rx="6" fill="#00d8ff" opacity=".35"/>
        <rect x="170" y="180" width="172" height="10" rx="5" fill="#fff" opacity=".18"/>
        <rect x="170" y="205" width="150" height="10" rx="5" fill="#fff" opacity=".18"/>
        <line x1="150" y1="${y}" x2="362" y2="${y}" stroke="#00e676" stroke-width="4" opacity=".85"/>`;
  }},
  { key: 'payment_received', exp: 'closed', prop: (t) => {
      const s = 1 + Math.sin(t * Math.PI * 2) * 0.06;
      return `<g transform="translate(330,270) scale(${s})"><circle r="46" fill="none" stroke="#00e676" stroke-width="8"/><path d="M-20 0 L-5 18 L26 -20" fill="none" stroke="#00e676" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></g>
        <circle cx="150" cy="330" r="14" fill="#f4c542" opacity="${0.6 + Math.sin(t*6.28)*0.3}"/>`;
  }},
  { key: 'processing_usdt', exp: 'focused', prop: (t) => {
      const rot = t * 360;
      return `<g transform="translate(330,290) rotate(${rot})"><circle r="34" fill="#00c853"/><text x="0" y="9" text-anchor="middle" font-size="30" font-weight="900" fill="#04140b" font-family="Arial">₮</text></g>
        <circle cx="330" cy="290" r="52" fill="none" stroke="#00d8ff" stroke-width="4" stroke-dasharray="18 10" opacity=".7" transform="rotate(${-rot*1.4} 330 290)"/>`;
  }},
  { key: 'waiting', exp: 'happy', prop: (t) => {
      const hourRot = t * 360;
      return `<g transform="translate(320,180)"><circle r="34" fill="#0c161d" stroke="#00d8ff" stroke-width="3"/>
        <line x1="0" y1="0" x2="0" y2="-20" stroke="#00d8ff" stroke-width="3" stroke-linecap="round" transform="rotate(${hourRot})"/>
        <line x1="0" y1="0" x2="0" y2="-13" stroke="#00e676" stroke-width="3" stroke-linecap="round" transform="rotate(${hourRot*3})"/></g>`;
  }},
  { key: 'queue', exp: 'sad', prop: (t) => {
      const dots = [0,1,2].map(i => {
        const a = Math.max(0, Math.min(1, (t*3 - i) % 3));
        return `<circle cx="${300+i*26}" cy="360" r="6" fill="#f4c542" opacity="${0.25+a*0.6}"/>`;
      }).join('');
      return `<rect x="270" y="140" width="130" height="150" rx="10" fill="#0f1c2e" stroke="#f4c542" stroke-opacity=".4" stroke-width="2"/>
        <rect x="286" y="160" width="98" height="8" rx="4" fill="#f4c542" opacity=".4"/>
        <rect x="286" y="182" width="98" height="8" rx="4" fill="#fff" opacity=".15"/>${dots}`;
  }},
  { key: 'sending_usdt', exp: 'wink', prop: (t) => {
      const x = 120 + (t % 1) * 220; // เดินทาง 120->340 อยู่ในกรอบเสมอ
      return `<g transform="translate(${x},250) rotate(-18)"><path d="M0 0 L34 0 L20 -10 M34 0 L20 10" fill="none" stroke="#00e676" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }},
  { key: 'success', exp: 'closed', prop: (t) => {
      const confetti = [0,1,2,3,4,5].map(i => {
        const seed = i * 47.3;
        const fall = (t + i / 6) % 1;
        const x = 60 + ((seed * 13) % 300); // clamp ให้อยู่ในกรอบ 400 (60-360)
        const y = 40 + fall * 320; // clamp สูงสุด 360
        const colors = ['#00e676','#00d8ff','#f4c542','#ffffff'];
        return `<rect x="${x}" y="${y}" width="7" height="7" fill="${colors[i % 4]}" opacity="${1 - fall}" transform="rotate(${fall*300} ${x+3} ${y+3})"/>`;
      }).join('');
      return confetti + `<circle cx="330" cy="270" r="30" fill="none" stroke="#00e676" stroke-width="7"/><path d="M316 270 L327 281 L346 256" fill="none" stroke="#00e676" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  }},
  { key: 'thank_you', exp: 'thanks', prop: (t) => {
      const rise = Math.sin(t * Math.PI * 2) * 8;
      return `<g transform="translate(330,${200-rise})"><path d="M0 14 C-16 -2 -16 -20 0 -8 C16 -20 16 -2 0 14 Z" fill="#ff7b9c"/></g>
        ${sparkle(t, 380, 260)}${sparkle(t + .5, 280, 140)}`;
  }},
  { key: 'vip', exp: 'wink', prop: (t) => {
      const shine = 0.4 + Math.sin(t * Math.PI * 2) * 0.35;
      return `<g transform="translate(330,240)"><path d="M-30 10 L-30 -30 L0 -46 L30 -30 L30 10 Q0 26 -30 10 Z" fill="#0d1117" stroke="#f4c542" stroke-width="3"/>
        <text x="0" y="-6" text-anchor="middle" font-size="18" font-weight="900" fill="#f4c542" font-family="Arial">VIP</text></g>
        <circle cx="366" cy="176" r="5" fill="#f4c542" opacity="${shine}"/>`;
  }},
  { key: 'support', exp: 'happy', prop: (t) => {
      const pulse = 0.5 + Math.sin(t * Math.PI * 2) * 0.5;
      return `<circle cx="90" cy="280" r="10" fill="#00d8ff" opacity="${pulse}"/>
        <path d="M20 40 Q44 14 68 40" stroke="#0e1b22" stroke-width="7" fill="none" stroke-linecap="round" transform="translate(220,180)"/>`;
  }},
  { key: 'error', exp: 'sad', prop: (t) => {
      const shake = Math.sin(t * Math.PI * 10) * 6;
      return `<g transform="translate(${330+shake},220)"><path d="M0 -30 L30 26 L-30 26 Z" fill="none" stroke="#ff5a6e" stroke-width="6" stroke-linejoin="round"/>
        <line x1="0" y1="-10" x2="0" y2="8" stroke="#ff5a6e" stroke-width="6" stroke-linecap="round"/><circle cx="0" cy="18" r="3" fill="#ff5a6e"/></g>`;
  }},
];

function sparkle(t, x, y) {
  const tt = ((t % 1) + 1) % 1;
  const op = Math.max(0, Math.sin(tt * Math.PI));
  const s = 0.6 + op * 0.6;
  return `<g transform="translate(${x},${y}) scale(${s})" opacity="${op.toFixed(2)}"><path d="M0 -10 L2.4 -2.4 L10 0 L2.4 2.4 L0 10 L-2.4 2.4 L-10 0 L-2.4 -2.4 Z" fill="#00e676"/></g>`;
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}\n${err.slice(-800)}`))));
  });
}

async function renderState(state) {
  const tmpDir = `${TMP_ROOT}/${state.key}`;
  mkdirSync(tmpDir, { recursive: true });

  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    // idle bob เล็กน้อยทุก state ให้ดูมีชีวิต (หน่วยพิกเซล world 0-400)
    const bob = Math.sin(t * Math.PI * 2) * 6;
    const blinkPhase = t % 1;
    const exp = blinkPhase > 0.92 && state.exp === 'happy' ? 'closed' : state.exp;

    const propSvg = state.prop ? state.prop(t) : '';
    const svg = novaSticker({ exp, ty: bob, propSvg });
    const buf = await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toBuffer();
    writeFileSync(`${tmpDir}/f${String(i).padStart(3, '0')}.png`, buf);
  }

  const out = `${OUT_DIR}/${state.key}.webm`;
  await ffmpeg([
    '-y',
    '-framerate', String(FPS),
    '-i', `${tmpDir}/f%03d.png`,
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-metadata:s:v:0', 'alpha_mode="1"', // สำคัญ: WebM VP9 alpha ต้องมี tag นี้ให้ผู้เล่นอ่าน alpha ถูก
    '-b:v', '0', '-crf', '32',
    '-auto-alt-ref', '0',
    out,
  ]);

  rmSync(tmpDir, { recursive: true, force: true });
  return out;
}

console.log(`Rendering ${STATES.length} stickers @ ${FPS}fps x ${FRAMES} frames (${DURATION_S}s loop)...`);
for (const state of STATES) {
  const t0 = Date.now();
  const out = await renderState(state);
  console.log(`  ✓ ${out} (${Date.now() - t0}ms)`);
}
rmSync(TMP_ROOT, { recursive: true, force: true });
console.log('Done.');
