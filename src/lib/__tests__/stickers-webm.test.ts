import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DIR = join(process.cwd(), 'assets/stickers');
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

describe('sticker WEBM assets', () => {
  it('has all 12 rendered files under Telegram size limit', () => {
    expect(existsSync(DIR)).toBe(true);
    for (const key of EXPECTED) {
      const path = join(DIR, `${key}.webm`);
      expect(existsSync(path), path).toBe(true);
      const size = statSync(path).size;
      expect(size).toBeGreaterThan(1000);
      expect(size).toBeLessThanOrEqual(256 * 1024);
    }
  });

  it('passes verify-stickers.mjs (ffprobe VP9 512 alpha)', () => {
    const r = spawnSync('node', ['scripts/verify-stickers.mjs'], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    if (r.status !== 0) {
      console.log(r.stdout);
      console.error(r.stderr);
    }
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK: 12 stickers/);
  });

  it('does not accidentally leave tmp frames', () => {
    const tmp = join(process.cwd(), 'assets/.tmp-frames');
    expect(existsSync(tmp)).toBe(false);
    const names = readdirSync(DIR);
    expect(names.every((n) => n.endsWith('.webm'))).toBe(true);
  });
});
