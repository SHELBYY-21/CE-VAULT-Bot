#!/usr/bin/env node
/**
 * ตรวจสเปก animated sticker WEBM (Telegram)
 * Usage: node scripts/verify-stickers.mjs
 */
import { spawnSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const OUT_DIR = 'assets/stickers';
const EXPECTED = [
  'welcome',
  'ocr_scanning',
  'payment_received',
  'processing_usdt',
  'waiting',
  'queue',
  'sending_usdt',
  'success',
  'thank_you',
  'vip',
  'error',
  'support',
];

const MAX_BYTES = 256 * 1024; // Telegram animated sticker limit
const SIZE = 512;
const MIN_DUR = 2.0;
const MAX_DUR = 3.0;

function probe(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', file],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || 'ffprobe failed');
  return JSON.parse(r.stdout);
}

let failed = 0;
const files = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm')) : [];

console.log(`verify-stickers: ${OUT_DIR} (${files.length} webm)`);

for (const key of EXPECTED) {
  const name = `${key}.webm`;
  const path = join(OUT_DIR, name);
  if (!existsSync(path)) {
    console.error(`  ✗ missing ${name}`);
    failed++;
    continue;
  }
  const st = statSync(path);
  const info = probe(path);
  const stream = info.streams?.find((s) => s.codec_type === 'video') || info.streams?.[0];
  const dur = Number(info.format?.duration || 0);
  const w = Number(stream?.width || 0);
  const h = Number(stream?.height || 0);
  const codec = stream?.codec_name;
  const alpha = String(stream?.tags?.ALPHA_MODE || stream?.tags?.alpha_mode || '');
  const okSize = st.size > 0 && st.size <= MAX_BYTES;
  const okDim = w === SIZE && h === SIZE;
  const okCodec = codec === 'vp9';
  const okDur = dur >= MIN_DUR && dur <= MAX_DUR;
  const okAlpha = /1/.test(alpha);

  if (okSize && okDim && okCodec && okDur && okAlpha) {
    console.log(
      `  ✓ ${name}  ${w}x${h} vp9  ${dur.toFixed(1)}s  ${(st.size / 1024).toFixed(0)}KB  alpha=${alpha}`,
    );
  } else {
    console.error(
      `  ✗ ${name}  codec=${codec} ${w}x${h} dur=${dur} size=${st.size} alpha=${alpha || 'none'}`,
    );
    failed++;
  }
}

const extras = files.filter((f) => !EXPECTED.includes(f.replace(/\.webm$/, '')));
if (extras.length) console.log(`  · extras: ${extras.join(', ')}`);

if (failed) {
  console.error(`\nFAILED: ${failed} sticker(s)`);
  process.exit(1);
}
console.log(`\nOK: ${EXPECTED.length} stickers meet Telegram WEBM checks`);
