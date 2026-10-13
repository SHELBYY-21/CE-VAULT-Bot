import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');
let source = readFileSync(serverPath, 'utf8');

// Replace 503 for /api/v1/telegram/status with a 200 degraded payload so the
// browser does not log network errors when the bot token is absent.
const telegramOld = 'if (!telegram) return problem(res, req, 503, "TELEGRAM_NOT_CONFIGURED", "Telegram bot token is not configured for this server.");';
const telegramNew = 'if (!telegram) return res.json({ configured: false, webhook: null });';
if (source.includes(telegramOld)) {
  source = source.replace(telegramOld, telegramNew);
} else if (!source.includes(telegramNew)) {
  throw new Error('DEGRADED_TELEGRAM_ANCHOR_NOT_FOUND');
}

// Replace 503 for /api/v1/ops/overview with a 200 empty overview so the
// browser does not log network errors when Supabase credentials are absent.
const opsOld = 'if (!requireRepository(req, res)) return;\n  try {\n    const transactionLimit = 1000;';
const opsNew = 'if (!repository || !currentSafety().ok) {\n    return res.set("Cache-Control", "no-store").json({ data: buildOpsOverview({}) });\n  }\n  try {\n    const transactionLimit = 1000;';
if (source.includes(opsOld)) {
  source = source.replace(opsOld, opsNew);
} else if (source.includes('buildOpsOverview({})')) {
  // Already patched
} else {
  throw new Error('DEGRADED_OPS_ANCHOR_NOT_FOUND');
}

writeFileSync(serverPath, source);
console.log('Patched CE VAULT degraded endpoints to return 200 instead of 503.');
