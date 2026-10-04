import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'appsrc');
const mainPath = path.join(appPath, 'src', 'main.js');
let source = readFileSync(mainPath, 'utf8');

const oldServices = `const services = Object.freeze([\n  { name: "Outbox Dispatcher", state: "OFFLINE", tone: "red", meta: "last heartbeat 04:12 ago", note: "Reads remain available; writes are not implied." },\n  { name: "Settlement Adapter", state: "DEGRADED", tone: "amber", meta: "sandbox dependency · 98.2% freshness", note: "Sandbox preview only; no external money movement." },\n  { name: "OCR Worker", state: "HEALTHY", tone: "green", meta: "heartbeat 12s ago", note: "2 active jobs" },\n  { name: "Processing Worker", state: "HEALTHY", tone: "green", meta: "heartbeat 08s ago", note: "1 active job" },\n  { name: "CE VAULT Sync", state: "HEALTHY", tone: "green", meta: "heartbeat 11s ago", note: "source revision 184" },\n  { name: "Telegram Bot", state: "HEALTHY", tone: "green", meta: "heartbeat 06s ago", note: "durable card projection" },\n]);`;

const newServices = `let services = [\n  { name: "Workflow API", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Waiting for /api/v1/health." },\n  { name: "Supabase Source", state: "CHECKING", tone: "amber", meta: "database probe pending", note: "Authoritative workflow source." },\n  { name: "Telegram Bot", state: "CHECKING", tone: "amber", meta: "webhook probe pending", note: "Durable operator projection." },\n  { name: "Settlement Gate", state: "LOCKED", tone: "green", meta: "sandbox enforced", note: "Live settlement remains disabled." },\n];`;

if (!source.includes(oldServices)) throw new Error('MANUS_HEALTH_FIXTURE_ANCHOR_MISSING');
source = source.replace(oldServices, newServices);

const hydrateAnchor = 'async function hydrateWorkflowProjection() {';
const healthHydrator = `async function hydrateRuntimeHealth() {\n  try {\n    const [healthResponse, telegramResponse] = await Promise.all([\n      fetch("/api/v1/health", { headers: { Accept: "application/json" }, cache: "no-store" }),\n      fetch("/api/v1/telegram/status", { headers: { Accept: "application/json" }, cache: "no-store" }),\n    ]);\n    if (!healthResponse.ok) throw new Error("HEALTH_API_UNAVAILABLE");\n    const health = await healthResponse.json();\n    const telegram = telegramResponse.ok ? await telegramResponse.json() : null;\n    const databaseHealthy = health.database === "CONFIGURED";\n    const safetyLocked = health.safety === "LOCKED" && health.live_settlement_enabled === false;\n    const telegramHealthy = health.telegram === "CONFIGURED" && Boolean(telegram?.configured && telegram?.webhook?.url);\n\n    services = [\n      { name: "Workflow API", state: "HEALTHY", tone: "green", meta: health.mode || "SANDBOX", note: "Runtime health endpoint is responding." },\n      { name: "Supabase Source", state: databaseHealthy ? "HEALTHY" : "DEGRADED", tone: databaseHealthy ? "green" : "amber", meta: health.database || "UNKNOWN", note: "Authoritative workflow source." },\n      { name: "Telegram Bot", state: telegramHealthy ? "HEALTHY" : "DEGRADED", tone: telegramHealthy ? "green" : "amber", meta: telegramHealthy ? \`webhook · pending \${telegram.webhook.pending_update_count ?? 0}\` : "webhook unavailable", note: "Durable operator projection." },\n      { name: "Settlement Gate", state: safetyLocked ? "LOCKED" : "DEGRADED", tone: safetyLocked ? "green" : "red", meta: safetyLocked ? "sandbox enforced" : "safety check failed", note: safetyLocked ? "Live settlement remains disabled." : "Review runtime safety flags immediately." },\n    ];\n    ui.freshness = databaseHealthy && safetyLocked && telegramHealthy ? "FRESH" : "DEGRADED";\n    renderApp();\n  } catch {\n    services = [\n      { name: "Workflow API", state: "OFFLINE", tone: "red", meta: "health probe failed", note: "Runtime health could not be verified." },\n      { name: "Supabase Source", state: "UNKNOWN", tone: "amber", meta: "probe unavailable", note: "Authoritative workflow source was not verified." },\n      { name: "Telegram Bot", state: "UNKNOWN", tone: "amber", meta: "probe unavailable", note: "Webhook status was not verified." },\n      { name: "Settlement Gate", state: "LOCKED", tone: "green", meta: "client default", note: "UI never enables live settlement." },\n    ];\n    ui.freshness = "OFFLINE";\n    renderApp();\n  }\n}\n\n`;

if (!source.includes(hydrateAnchor)) throw new Error('MANUS_HEALTH_HYDRATE_ANCHOR_MISSING');
source = source.replace(hydrateAnchor, healthHydrator + hydrateAnchor);

const bootAnchor = 'hydrateWorkflowProjection();\nstartActivityStream();';
if (!source.includes(bootAnchor)) throw new Error('MANUS_HEALTH_BOOT_ANCHOR_MISSING');
source = source.replace(bootAnchor, 'hydrateWorkflowProjection();\nhydrateRuntimeHealth();\nstartActivityStream();');

writeFileSync(mainPath, source);

const check = spawnSync(process.execPath, ['--check', mainPath], { cwd: appPath, stdio: 'inherit', env: process.env });
if (check.status !== 0) process.exit(check.status ?? 1);
const build = spawnSync('npm', ['run', 'build'], { cwd: appPath, stdio: 'inherit', env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);
console.log('CE VAULT live health UI patch applied and rebuilt.');
