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
  if (!configured || !telegram) {
    res.set("Cache-Control", "no-store").json({ configured: false, webhook: null });
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      // Scope the deadline to diagnostics; never retry outbound messages.
      const response = await fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        const status = response.ok ? Number(payload?.error_code) : response.status;
        const error = new Error(status === 401 || status === 403 ? "TELEGRAM_AUTH_FAILED" : "TELEGRAM_API_ERROR");
        error.transient = status === 429 || status >= 500;
        throw error;
      }
      const webhook = payload.result;
      res.set("Cache-Control", "no-store").json({ configured, webhook });
      return;
    } catch (error) {
      clearTimeout(timeout);
      if (error?.transient !== false && attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      res.set("Cache-Control", "no-store").json({
        configured,
        webhook: null,
        degraded: error?.transient === false ? error.message : "TELEGRAM_API_UNREACHABLE",
        detail: error?.transient === false ? error.message : "TELEGRAM_API_UNREACHABLE",
      });
      return;
    } finally {
      clearTimeout(timeout);
    }
  }
});

` + telegramStatusAnchor;
server = replaceOnce(server, telegramStatusAnchor, hardenedStatusRoute, 'TELEGRAM_STATUS_DEGRADE_ANCHOR_NOT_FOUND');
writeFileSync(serverPath, server);

console.log('[CE STATUS DEGRADE] Telegram status route retries and degrades honestly instead of a misleading 503.');
