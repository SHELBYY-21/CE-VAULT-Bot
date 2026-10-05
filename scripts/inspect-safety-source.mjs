import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  path.join(root, 'appsrc', 'server', 'index.mjs'),
  path.join(root, 'appsrc', 'server', 'domain', 'contract.mjs'),
];

for (const target of files) {
  const source = readFileSync(target, 'utf8');
  const lines = source.split('\n');
  console.log(`[CE SAFETY FILE] ${path.relative(root, target)}`);
  for (let i = 0; i < lines.length; i += 1) {
    if (/assertSandboxFlags|safety|live_settlement|LIVE_SETTLEMENT|SANDBOX|process\.env/i.test(lines[i])) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 4);
      console.log(`[CE SAFETY SOURCE ${start + 1}-${end}]`);
      console.log(lines.slice(start, end).join('\n'));
    }
  }
}
