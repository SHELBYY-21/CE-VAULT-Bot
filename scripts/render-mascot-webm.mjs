// ผลิต official CE EMPIRE mascot WEBM (VP9 + alpha) — 8 สถานะ
// ตาม docs/mascot-motion-lock.md (สเปก Telegram: 512px, VP9, alpha, ≤3s, ≤256KB, ไม่มีเสียง)
// Usage: npm i -D sharp && node scripts/render-mascot-webm.mjs
import ffmpegPath from 'ffmpeg-static';
import { spawn, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'fs';
import { ceRobotSticker } from './ce-mascot.mjs';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('✗ ต้องติดตั้ง sharp ก่อน: npm i -D sharp');
  process.exit(1);
}

const SIZE = 512;
const FPS = 20;
const DURATION_S = 2.4; // loop สั้นกระชับ อยู่ในเพดาน 3 วินาทีของ Telegram
const FRAMES = Math.round(FPS * DURATION_S);
const MAX_BYTES = 256 * 1024;
const OUT_DIR = 'assets/mascot';
const TMP_ROOT = 'assets/.tmp-mascot-frames';

function sparkle(t, x, y) {
  const tt = ((t % 1) + 1) % 1;
  const op = Math.max(0, Math.sin(tt * Math.PI));
  const s = 0.6 + op * 0.6;
  return `<g transform="translate(${x},${y}) scale(${s.toFixed(2)})" opacity="${op.toFixed(2)}"><path d="M0 -10 L2.4 -2.4 L10 0 L2.4 2.4 L0 10 L-2.4 2.4 L-10 0 L-2.4 -2.4 Z" fill="#FFD766"/></g>`;
}

// ── 8 canonical mascot states: hi · scan · wait · work · success · alert · done · idle ──
const STATES = [
  {
    key: 'hi', exp: 'happy',
    armR: (t) => -25 - Math.sin(t * Math.PI * 4) * 35,
    prop: (t) => `${sparkle(t, 352, 122)}${sparkle(t + 0.4, 58, 205)}`,
  },
  {
    key: 'scan', exp: 'focused',
    armL: () => -18, armR: () => 18,
    prop: (t) => {
      const y = 150 + (t % 1) * 130;
      return `<rect x="292" y="140" width="86" height="160" rx="10" fill="#0F1C2E" stroke="#00D4FF" stroke-opacity=".55" stroke-width="2"/>
        <rect x="304" y="162" width="62" height="9" rx="4" fill="#00D4FF" opacity=".4"/>
        <rect x="304" y="182" width="62" height="7" rx="3" fill="#fff" opacity=".16"/>
        <rect x="304" y="198" width="50" height="7" rx="3" fill="#fff" opacity=".16"/>
        <rect x="304" y="214" width="56" height="7" rx="3" fill="#fff" opacity=".16"/>
        <line x1="292" y1="${y.toFixed(1)}" x2="378" y2="${y.toFixed(1)}" stroke="#00E676" stroke-width="4" opacity=".85"/>`;
    },
  },
  {
    key: 'wait', exp: 'happy',
    prop: (t) => {
      return `<g transform="translate(335,205)"><circle r="32" fill="#0C161D" stroke="#00D4FF" stroke-width="3"/>
        <line x1="0" y1="0" x2="0" y2="-22" stroke="#00D4FF" stroke-width="3" stroke-linecap="round" transform="rotate(${(t * 1080).toFixed(1)})"/>
        <line x1="0" y1="0" x2="0" y2="-14" stroke="#00E676" stroke-width="3" stroke-linecap="round" transform="rotate(${(t * 360).toFixed(1)})"/>
        <circle r="3" fill="#00D4FF"/></g>`;
    },
  },
  {
    key: 'work', exp: 'focused', armR: () => 14,
    prop: (t) => {
      return `<rect x="288" y="150" width="100" height="130" rx="10" fill="#0F1C2E" stroke="#F0B429" stroke-opacity=".45" stroke-width="2"/>
        <rect x="300" y="170" width="76" height="8" rx="4" fill="#F0B429" opacity=".45"/>
        <rect x="300" y="188" width="60" height="6" rx="3" fill="#fff" opacity=".15"/>
        <rect x="300" y="202" width="68" height="6" rx="3" fill="#fff" opacity=".15"/>
        <rect x="300" y="244" width="76" height="10" rx="5" fill="#05090E"/>
        <rect x="300" y="244" width="${(t * 76).toFixed(1)}" height="10" rx="5" fill="#00E676"/>
        <g transform="translate(338,226) rotate(${(t * 360).toFixed(1)})"><circle r="9" fill="none" stroke="#00D4FF" stroke-width="2.4" stroke-dasharray="4 3"/></g>`;
    },
  },
  {
    key: 'success', exp: 'closed',
    prop: (t) => {
      const confetti = [0, 1, 2, 3, 4, 5].map((i) => {
        const seed = i * 47.3;
        const fall = (t + i / 6) % 1;
        const x = 50 + ((seed * 13) % 320);
        const y = 30 + fall * 340;
        const colors = ['#00E676', '#00D4FF', '#F0B429', '#FFD766'];
        return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="7" height="7" fill="${colors[i % 4]}" opacity="${(1 - fall).toFixed(2)}" transform="rotate(${(fall * 300).toFixed(0)} ${x + 3.5} ${y + 3.5})"/>`;
      }).join('');
      return confetti + `<circle cx="335" cy="190" r="30" fill="none" stroke="#00E676" stroke-width="7"/>
        <path d="M321 190 L332 201 L351 176" fill="none" stroke="#00E676" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
  },
  {
    key: 'alert', exp: 'wide',
    rot: (t) => Math.sin(t * Math.PI * 10) * 2,
    prop: (t) => {
      const shake = Math.sin(t * Math.PI * 10) * 6;
      return `<g transform="translate(${(335 + shake).toFixed(1)},200)"><path d="M0 -32 L34 28 L-34 28 Z" fill="none" stroke="#FF5252" stroke-width="6" stroke-linejoin="round"/>
        <line x1="0" y1="-12" x2="0" y2="8" stroke="#FF5252" stroke-width="6" stroke-linecap="round"/><circle cx="0" cy="18" r="3.2" fill="#FF5252"/></g>`;
    },
  },
  {
    key: 'done', exp: 'closed',
    prop: (t) => {
      const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.08;
      return `<g transform="translate(335,190) scale(${pulse.toFixed(3)})"><circle r="34" fill="none" stroke="#F0B429" stroke-width="6"/>
        <path d="M-15 0 L-4 12 L18 -12" fill="none" stroke="#F0B429" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>
        ${sparkle(t, 372, 122)}${sparkle(t + 0.5, 300, 262)}`;
    },
  },
  {
    key: 'idle', exp: 'happy',
    prop: (t) => {
      const op = 0.1 + Math.sin(t * Math.PI * 2) * 0.07;
      return `<circle cx="200" cy="205" r="98" fill="none" stroke="#00D4FF" stroke-opacity="${op.toFixed(3)}" stroke-width="2.5"/>`;
    },
  },
];

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
    // bob เบา ๆ ทุก state (idle หายใจช้ากว่าปกติ)
    const bob = Math.sin(t * Math.PI * 2) * (state.key === 'idle' ? 3.5 : 6);
    const blinkPhase = t % 1;
    const exp = blinkPhase > 0.92 && state.exp === 'happy' ? 'closed' : state.exp;
    const armL = state.armL ? state.armL(t) : 0;
    const armR = state.armR ? state.armR(t) : 0;
    const rot = state.rot ? state.rot(t) : 0;
    const propSvg = state.prop ? state.prop(t) : '';
    const svg = ceRobotSticker({ exp, ty: bob, rot, armL, armR, propSvg });
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
    '-metadata:s:v:0', 'alpha_mode="1"', // WebM VP9 alpha ต้องมี tag นี้
    '-b:v', '0', '-crf', '32',
    '-auto-alt-ref', '0',
    out,
  ]);

  rmSync(tmpDir, { recursive: true, force: true });
  return out;
}

// ตรวจสเปกหลังเข้ารหัส: ขนาด ≤ 256KB เสมอ + ffprobe (ถ้ามี) ตรวจ vp9/512/alpha/duration
function validate(file) {
  const st = statSync(file);
  const kb = (st.size / 1024).toFixed(0);
  const sizeOk = st.size > 0 && st.size <= MAX_BYTES;
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' });
  if (r.status === 0) {
    const info = JSON.parse(r.stdout);
    const stream = (info.streams || []).find((s) => s.codec_type === 'video');
    const dur = Number(info.format?.duration || 0);
    const alpha = String(stream?.tags?.ALPHA_MODE || stream?.tags?.alpha_mode || '');
    const codecOk = stream?.codec_name === 'vp9';
    const dimOk = Number(stream?.width) === SIZE && Number(stream?.height) === SIZE;
    const durOk = dur > 0 && dur <= 3;
    const alphaOk = /1/.test(alpha);
    return { ok: sizeOk && codecOk && dimOk && durOk && alphaOk, kb, note: `vp9=${codecOk} 512=${dimOk} dur=${dur.toFixed(1)}s alpha=${alphaOk}` };
  }
  return { ok: sizeOk, kb, note: 'ffprobe ไม่อยู่ใน PATH — ตรวจเฉพาะขนาดไฟล์ (ติดตั้ง ffmpeg พร้อม ffprobe เพื่อตรวจสเปกเต็ม)' };
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Rendering ${STATES.length} CE mascot states @ ${FPS}fps x ${FRAMES} frames (${DURATION_S}s loop)...`);
let failed = 0;
for (const state of STATES) {
  const t0 = Date.now();
  const out = await renderState(state);
  const check = validate(out);
  if (check.ok) {
    console.log(`  ✓ ${out}  ${check.kb}KB  ${check.note}  (${Date.now() - t0}ms)`);
  } else {
    console.error(`  ✗ ${out}  ${check.kb}KB  ${check.note}`);
    failed++;
  }
}
rmSync(TMP_ROOT, { recursive: true, force: true });
if (failed) {
  console.error(`\nFAILED: ${failed} state(s) — ลดความละเอียด (เพิ่ม -crf) หรือลด DURATION_S แล้วรันใหม่`);
  process.exit(1);
}
console.log(`\nOK: ${STATES.length} mascot WEBM meet Telegram checks — อัปโหลดผ่าน @Stickers แล้วนำ file_id ไปตั้งค่า WEBM_*_FILE_ID`);
