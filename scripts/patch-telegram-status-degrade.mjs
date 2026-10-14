import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');

function replaceOnce(source, needle, replacement, code) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${code}:EXPECTED_1_FOUND_${count}`);
  return source.replace(needle, replacement);
}

// Public diagnostics must degrade honestly: a transient Telegram API transport failure
// must not surface as a misleading 503 "Workflow source of truth is unavailable".
// The hardened route registers BEFORE the base route (Express first match wins):
// bounded retries, then 200 with webhook=null + degraded marker. Never invents webhook data.
let server = readFileSync(serverPath, 'utf8');
const telegramStatusAnchor = 'app.get("/api/v1/telegram/status", async (req, res) => {';
const hardenedStatusRoute = String.raw`app.get("/api/v1/telegram/status", async (req, res) => {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const webhook = await telegram.getWebhookInfo();
      res.set("Cache-Control", "no-store").json({ configured, webhook });
      return;
    } catch (error) {
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      res.set("Cache-Control", "no-store").json({
        configured,
        webhook: null,
        degraded: "TELEGRAM_API_UNREACHABLE",
        detail: String(error?.message || "TELEGRAM_API_UNREACHABLE").slice(0, 120),
      });
    }
  }
});

` + telegramStatusAnchor;
server = replaceOnce(server, telegramStatusAnchor, hardenedStatusRoute, 'TELEGRAM_STATUS_DEGRADE_ANCHOR_NOT_FOUND');
writeFileSync(serverPath, server);

console.log('[CE STATUS DEGRADE] Telegram status route retries and degrades honestly instead of a misleading 503.');
