import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'appsrc');
const partsDir = path.join(root, '.manus-source', 'parts');
const archivePath = path.join(root, '.manus-source', 'cevault.tgz');

if (existsSync(appPath)) rmSync(appPath, { recursive: true, force: true });
mkdirSync(appPath, { recursive: true });

const encoded = readdirSync(partsDir)
  .sort()
  .map((name) => readFileSync(path.join(partsDir, name), 'utf8'))
  .join('');
writeFileSync(archivePath, Buffer.from(encoded, 'base64'));

function run(cmd, args, cwd) {
  const out = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (out.status !== 0) process.exit(out.status ?? 1);
}

run('tar', ['-xzf', archivePath, '-C', appPath], root);
run('npm', ['ci', '--no-audit', '--no-fund'], appPath);
run('npm', ['run', 'check'], appPath);
