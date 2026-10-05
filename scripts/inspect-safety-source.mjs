import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'appsrc', 'server', 'index.mjs');
const source = readFileSync(target, 'utf8');
const lines = source.split('\n');
for (let i = 0; i < lines.length; i += 1) {
  if (/safety|live_settlement|LIVE_SETTLEMENT|SANDBOX/i.test(lines[i])) {
    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length, i + 3);
    console.log(`[CE SAFETY SOURCE ${start + 1}-${end}]`);
    console.log(lines.slice(start, end).join('\n'));
  }
}
