import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'appsrc', 'src', 'main.js');
let source = readFileSync(mainPath, 'utf8');

const fixtureAnchor = 'let fixtures = [...DEMO_FIXTURES];';
if (!source.includes(fixtureAnchor)) throw new Error('RUNTIME_ACTIVITY_FIXTURE_ANCHOR_NOT_FOUND');
source = source.replace(fixtureAnchor, `${fixtureAnchor}\nlet runtimeActivity = [];`);

const hydrateAnchor = 'async function hydrateWorkflowProjection() {';
if (!source.includes(hydrateAnchor)) throw new Error('RUNTIME_ACTIVITY_HYDRATE_ANCHOR_NOT_FOUND');
const activityHydrator = `async function hydrateActivityFeed() {\n  try {\n    const response = await fetch("/api/v1/activity?limit=8", { headers: { Accept: "application/json" }, cache: "no-store" });\n    if (!response.ok) throw new Error("ACTIVITY_API_UNAVAILABLE");\n    const payload = await response.json();\n    runtimeActivity = Array.isArray(payload.data) ? payload.data : [];\n    ui.activityCheckedAt = new Date().toISOString();\n    renderApp();\n  } catch {\n    runtimeActivity = [];\n    ui.activityCheckedAt = new Date().toISOString();\n    renderApp();\n  }\n}\n\n`;
source = source.replace(hydrateAnchor, activityHydrator + hydrateAnchor);

const feedPattern = /function renderActivityFeed\(\) \{[\s\S]*?\n\}\n\nfunction renderSystemInfo/;
if (!feedPattern.test(source)) throw new Error('RUNTIME_ACTIVITY_RENDER_BLOCK_NOT_FOUND');
const feedReplacement = [
  "function renderActivityFeed() {",
  "  const items = runtimeActivity.slice(0, 8);",
  "  const labelFor = (entry) => {",
  "    if (entry.event_type === \"job.created.v1\") return \"Sandbox job created\";",
  "    if (entry.command_code === \"CONFIRM_PROCESS\") return \"Confirmation recorded\";",
  "    if (entry.to_state === \"COMPLETED\") return \"Sandbox workflow completed\";",
  "    return entry.event_type === \"job.state_changed.v1\" ? \"Workflow state changed\" : \"Workflow activity\";",
  "  };",
  "  const refFor = (entry) => entry.workflow_jobs?.public_ref || entry.job_id || \"workflow\";",
  "  const stateFor = (entry) => entry.to_state || entry.workflow_jobs?.state || \"—\";",
  "  const rows = items.length ? items.map((entry, index) => `<div class=\"feed-row\"><span class=\"feed-index\">${String(index + 1).padStart(2, \"0\")}</span><div><strong>${escapeHtml(labelFor(entry))}</strong><span><code>${escapeHtml(refFor(entry))}</code> · ${escapeHtml(stateFor(entry))}</span></div><time>${escapeHtml(formatBangkokTime(entry.occurred_at).replace(\" ICT\", \"\"))}</time></div>`).join(\"\") : `<div class=\"feed-row\"><span class=\"feed-index\">—</span><div><strong>Activity feed unavailable</strong><span>Database-backed workflow remains authoritative.</span></div><time>—</time></div>`;",
  "  const asOf = items[0]?.occurred_at ? formatBangkokTime(items[0].occurred_at) : (ui.activityCheckedAt ? formatBangkokTime(ui.activityCheckedAt) : \"pending\");",
  "  return `<section class=\"panel feed-panel\" aria-labelledby=\"feed-title\"><div class=\"panel-heading\"><div><span class=\"eyebrow\">READ MODEL / LAST 8</span><h2 id=\"feed-title\">Recent Activity</h2></div><span class=\"feed-asof\">${escapeHtml(asOf)}</span></div><div class=\"feed-list\">${rows}</div><div class=\"stale-note\"><span class=\"status-emblem tone-cyan\">i</span> Live projection from /api/v1/activity. Database-backed workflow remains authoritative.</div></section>`;",
  "}",
  "",
  "function renderSystemInfo"
].join("\n");
source = source.replace(feedPattern, feedReplacement);

const sseOld = 'stream.addEventListener("activity", () => window.setTimeout(hydrateWorkflowProjection, 80));';
if (!source.includes(sseOld)) throw new Error('RUNTIME_ACTIVITY_SSE_ANCHOR_NOT_FOUND');
source = source.replace(sseOld, 'stream.addEventListener("activity", () => window.setTimeout(() => { hydrateWorkflowProjection(); hydrateActivityFeed(); }, 80));');

const bootOld = 'hydrateWorkflowProjection();\nhydrateRuntimeHealth();';
if (!source.includes(bootOld)) throw new Error('RUNTIME_ACTIVITY_BOOT_ANCHOR_NOT_FOUND');
source = source.replace(bootOld, 'hydrateWorkflowProjection();\nhydrateActivityFeed();\nhydrateRuntimeHealth();\nwindow.setInterval(hydrateActivityFeed, 30_000);');

writeFileSync(mainPath, source);
console.log('Patched CE VAULT Recent Activity to runtime API projection.');
