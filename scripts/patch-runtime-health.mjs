import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'appsrc', 'src', 'main.js');
let source = readFileSync(mainPath, 'utf8');

const servicesPattern = /const services = Object\.freeze\(\[[\s\S]*?\]\);\n\nconst freshnessMeta/;
if (!servicesPattern.test(source)) throw new Error('RUNTIME_HEALTH_SERVICES_BLOCK_NOT_FOUND');
source = source.replace(servicesPattern, `let services = [
  { name: "Workflow API", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Authoritative API health is loading." },
  { name: "Supabase", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Database source of truth is loading." },
  { name: "Telegram Bot", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Webhook health is loading." },
  { name: "Settlement Gate", state: "HEALTHY", tone: "green", meta: "sandbox lock active", note: "LIVE_SETTLEMENT_ENABLED=false; no external money movement." },
];

const freshnessMeta`);

const hydrateMarker = `async function hydrateWorkflowProjection() {`;
if (!source.includes(hydrateMarker)) throw new Error('RUNTIME_HEALTH_HYDRATE_MARKER_NOT_FOUND');
source = source.replace(hydrateMarker, `async function hydrateRuntimeHealth() {
  const checkedAt = new Date().toISOString();
  try {
    const [healthResponse, telegramResponse] = await Promise.all([
      fetch("/api/v1/health", { headers: { Accept: "application/json" }, cache: "no-store" }),
      fetch("/api/v1/telegram/status", { headers: { Accept: "application/json" }, cache: "no-store" }),
    ]);
    const health = healthResponse.ok ? await healthResponse.json() : null;
    const telegram = telegramResponse.ok ? await telegramResponse.json() : null;
    const apiHealthy = Boolean(healthResponse.ok && health?.mode === "SANDBOX" && health?.safety === "LOCKED");
    const dbHealthy = Boolean(apiHealthy && health?.database === "CONFIGURED");
    const telegramHealthy = Boolean(telegramResponse.ok && telegram?.configured && telegram?.webhook?.url);
    services = [
      { name: "Workflow API", state: apiHealthy ? "HEALTHY" : "DEGRADED", tone: apiHealthy ? "green" : "amber", meta: apiHealthy ? "SANDBOX / LOCKED" : "health probe failed", note: apiHealthy ? "Runtime safety contract verified." : "Inspect /api/v1/health before operator writes." },
      { name: "Supabase", state: dbHealthy ? "HEALTHY" : "DEGRADED", tone: dbHealthy ? "green" : "amber", meta: dbHealthy ? "source of truth configured" : "database unavailable", note: dbHealthy ? "Workflow database is configured." : "Database-backed workflow is unavailable." },
      { name: "Telegram Bot", state: telegramHealthy ? "HEALTHY" : "DEGRADED", tone: telegramHealthy ? "green" : "amber", meta: telegramHealthy ? \`webhook active · pending \${telegram.webhook.pending_update_count ?? 0}\` : "webhook probe unavailable", note: telegramHealthy ? "Canonical webhook is registered." : "Telegram status requires operator attention." },
      { name: "Settlement Gate", state: health?.live_settlement_enabled === false ? "HEALTHY" : "DEGRADED", tone: health?.live_settlement_enabled === false ? "green" : "amber", meta: health?.live_settlement_enabled === false ? "sandbox lock active" : "unexpected live flag", note: "No external money movement is enabled by this dashboard." },
    ];
    ui.freshness = services.every((service) => service.state === "HEALTHY") ? "FRESH" : "DEGRADED";
  } catch {
    services = [
      { name: "Runtime Health", state: "OFFLINE", tone: "red", meta: "probe failed", note: "Latest runtime health could not be verified." },
      { name: "Settlement Gate", state: "HEALTHY", tone: "green", meta: "sandbox UI lock", note: "Client controls still expose no live settlement action." },
    ];
    ui.freshness = "OFFLINE";
  }
  ui.healthCheckedAt = checkedAt;
  renderApp();
}

${hydrateMarker}`);

source = source.replace(
  `<div class="health-footer"><span>Source revision <code>184</code></span><span>As of 19:36 ICT / UTC stored</span></div>`,
  '<div class="health-footer"><span>Source <code>runtime API</code></span><span>Checked ${ui.healthCheckedAt ? formatBangkokTime(ui.healthCheckedAt) : "pending"}</span></div>',
);

source = source.replace(
  `hydrateWorkflowProjection();\nstartActivityStream();`,
  `hydrateWorkflowProjection();\nhydrateRuntimeHealth();\nwindow.setInterval(hydrateRuntimeHealth, 30_000);\nstartActivityStream();`,
);

writeFileSync(mainPath, source);
console.log('Patched CE VAULT health stack to runtime API probes.');
