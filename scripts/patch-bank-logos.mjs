// CE BANK LOGOS - real Thai bank brand SVGs (MIT, omise/banks-logo).
// Installs assets into appsrc/server/brand/banks and serves them read-only.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'appsrc');
const serverPath = path.join(appRoot, 'server', 'index.mjs');

function replaceOnce(source, needle, replacement, code) {
  if (!source.includes(needle)) throw new Error(code);
  return source.replace(needle, replacement);
}

const sourceDir = path.join(root, 'runtime-patches', 'brand', 'banks');
const targetDir = path.join(appRoot, 'server', 'brand', 'banks');
mkdirSync(targetDir, { recursive: true });
for (const entry of readdirSync(sourceDir)) {
  copyFileSync(path.join(sourceDir, entry), path.join(targetDir, entry));
}

const allowed = ['scb', 'ktb', 'kbank', 'bbl', 'bay', 'gsb', 'ttb'];
const allowedLiteral = JSON.stringify(allowed);
const api404Anchor = 'app.all("/api/{*path}", (req, res) => problem(res, req, 404, "API_ROUTE_NOT_FOUND", "No API resource matches this route."));';
const routeLines = [
  'app.get("/brand/banks/:code", (req, res) => {',
  '  const allowed = new Set(' + allowedLiteral + ');',
  '  const code = String(req.params.code || "").toLowerCase();',
  '  if (!allowed.has(code)) {',
  '    problem(res, req, 404, "BANK_LOGO_NOT_FOUND", "No bank logo matches this code.");',
  '    return;',
  '  }',
  '  res.set("Cache-Control", "public, max-age=86400").type("image/svg+xml").sendFile(path.join(ROOT, "server", "brand", "banks", code + ".svg"));',
  '});',
  '',
].join('\n');
let server = readFileSync(serverPath, 'utf8');
server = replaceOnce(server, api404Anchor, routeLines + api404Anchor, 'BANK_LOGO_ROUTE_ANCHOR_NOT_FOUND');
writeFileSync(serverPath, server);
console.log('[CE BANK LOGOS] 7 real Thai bank SVGs installed, /brand/banks/:code route active.');
