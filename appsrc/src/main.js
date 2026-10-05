import "./styles.css";

const CANONICAL_STATES = Object.freeze([
  "IDLE",
  "SCANNING",
  "OCR_EXTRACTING",
  "VERIFYING",
  "NEED_CONFIRMATION",
  "PROCESSING",
  "WAITING",
  "SETTLING",
  "COMPLETED",
  "FAILED",
  "DUPLICATE",
  "TIMEOUT",
]);

const TERMINAL_STATES = Object.freeze(["COMPLETED", "FAILED", "DUPLICATE", "TIMEOUT"]);
const FLOW_STAGES = Object.freeze(["SCAN", "OCR", "VERIFY", "CONFIRM", "PROCESS", "SETTLEMENT", "DONE"]);
const LIVE_SETTLEMENT_ENABLED = false;
const FORBIDDEN_OPERATOR_ACTION_NAMES = Object.freeze(["SETTLE", "PAY", "TRANSFER", "PAYOUT", "LIVE"]);

const stateMeta = Object.freeze({
  IDLE: { tone: "neutral", label: "READY", icon: "○", stage: 0, progress: 0, detail: "No active work. Intake is standing by." },
  SCANNING: { tone: "cyan", label: "SCANNING", icon: "⌁", stage: 0, progress: 15, detail: "Evidence capture is being validated." },
  OCR_EXTRACTING: { tone: "cyan", label: "OCR / READING", icon: "▤", stage: 1, progress: 30, detail: "OCR proposal is not trusted until verified." },
  VERIFYING: { tone: "gold", label: "VERIFYING", icon: "◇", stage: 2, progress: 45, detail: "Checks and policy gates are in review." },
  NEED_CONFIRMATION: { tone: "amber", label: "ACTION REQUIRED", icon: "!", stage: 3, progress: 50, detail: "A current verified snapshot needs review." },
  PROCESSING: { tone: "cyan", label: "PROCESSING", icon: "◌", stage: 4, progress: 65, detail: "The confirmed sandbox request is in progress." },
  WAITING: { tone: "amber", label: "WAITING", icon: "◷", stage: 4, progress: 75, detail: "Waiting safely on a dependency or reconciliation." },
  SETTLING: { tone: "gold", label: "SANDBOX SETTLING", icon: "◎", stage: 5, progress: 90, detail: "Sandbox reconciliation is active; read-only view." },
  COMPLETED: { tone: "green", label: "COMPLETED", icon: "✓", stage: 6, progress: 100, detail: "Completed in sandbox; no live funds moved." },
  FAILED: { tone: "red", label: "FAILED", icon: "×", stage: 4, progress: null, detail: "The job was not completed. Review the safe error." },
  DUPLICATE: { tone: "amber", label: "DUPLICATE REVIEW", icon: "▱", stage: 2, progress: null, detail: "A matching workflow requires review." },
  TIMEOUT: { tone: "red", label: "TIMED OUT", icon: "◴", stage: 4, progress: null, detail: "Outcome is unknown until reconciliation completes." },
});

const DEMO_FIXTURES = Object.freeze([
  { id: "YB-SBX-0264", state: "NEED_CONFIRMATION", type: "CARD TOP-UP", timestamp: "19:34 ICT", age: "2m", amount: "12500.00", secondary: "Verified snapshot expires in 08:42 · review gate open", worker: "VERIFY-02", checks: "5 pass · 1 review" },
  { id: "YB-SBX-0261", state: "FAILED", type: "BILL PAYMENT", timestamp: "19:31 ICT", age: "5m", amount: "890.00", secondary: "Safe error · provider sandbox rejected request", worker: "PROC-01", checks: "ERR_PROVIDER_REJECTED" },
  { id: "YB-SBX-0258", state: "TIMEOUT", type: "CASH IN", timestamp: "19:28 ICT", age: "8m", amount: "3200.00", secondary: "Reconciliation required · external outcome unknown", worker: "RECON-01", checks: "DEADLINE_EXCEEDED" },
  { id: "YB-SBX-0257", state: "WAITING", type: "REFUND", timestamp: "19:26 ICT", age: "10m", amount: "410.00", secondary: "Awaiting dependency response · same operation key", worker: "QUEUE-03", checks: "PROVIDER_UNKNOWN" },
  { id: "YB-SBX-0255", state: "SETTLING", type: "FX SWAP", timestamp: "19:22 ICT", age: "14m", amount: "650.00", secondary: "Sandbox reconciliation active · no repeat request", worker: "ADAPTER-01", checks: "read-only" },
  { id: "YB-SBX-0252", state: "PROCESSING", type: "COLLECTION", timestamp: "19:18 ICT", age: "18m", amount: "2100.00", secondary: "Confirmation recorded once · worker is active", worker: "PROC-02", checks: "attempt 1 / 2" },
  { id: "YB-SBX-0249", state: "VERIFYING", type: "TOP-UP", timestamp: "19:14 ICT", age: "22m", amount: "980.00", secondary: "Duplicate fingerprint and limits under review", worker: "VERIFY-01", checks: "4 pass · 0 fail" },
  { id: "YB-SBX-0245", state: "OCR_EXTRACTING", type: "BILL PAYMENT", timestamp: "19:08 ICT", age: "28m", amount: "590.00", secondary: "Reading evidence · OCR proposal pending", worker: "OCR-02", checks: "attempt 1 / 3" },
  { id: "YB-SBX-0241", state: "SCANNING", type: "CARD TOP-UP", timestamp: "19:03 ICT", age: "33m", amount: "760.00", secondary: "Input checksum and file policy in progress", worker: "SCAN-01", checks: "indeterminate" },
  { id: "YB-SBX-0237", state: "IDLE", type: "REFUND", timestamp: "18:58 ICT", age: "38m", amount: "—", secondary: "No active work · awaiting approved evidence", worker: "INTAKE-01", checks: "not started" },
  { id: "YB-SBX-0234", state: "DUPLICATE", type: "CASH IN", timestamp: "18:54 ICT", age: "42m", amount: "1500.00", secondary: "Match found · review original workflow", worker: "VERIFY-03", checks: "match masked" },
  { id: "YB-SBX-0228", state: "COMPLETED", type: "COLLECTION", timestamp: "18:46 ICT", age: "50m", amount: "3050.00", secondary: "Durable completion recorded · audit ready", worker: "ADAPTER-02", checks: "reconciled" },
]);

let fixtures = [...DEMO_FIXTURES];
let runtimeActivity = [];

let services = [
  { name: "Workflow API", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Authoritative API health is loading." },
  { name: "Supabase", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Database source of truth is loading." },
  { name: "Telegram Bot", state: "CHECKING", tone: "amber", meta: "runtime probe pending", note: "Webhook health is loading." },
  { name: "Settlement Gate", state: "HEALTHY", tone: "green", meta: "sandbox lock active", note: "LIVE_SETTLEMENT_ENABLED=false; no external money movement." },
];

const freshnessMeta = Object.freeze({
  FRESH: { tone: "green", label: "FRESH", age: "18s ago", page: "FRESH" },
  DEGRADED: { tone: "amber", label: "DEGRADED", age: "1m 42s ago", page: "DEGRADED" },
  OFFLINE: { tone: "red", label: "OFFLINE", age: "04m 12s ago", page: "OFFLINE" },
});

const app = document.querySelector("#app");
const ui = {
  freshness: "DEGRADED",
  reducedMotion: false,
  activityPulse: true,
  selectedJobId: "YB-SBX-0264",
  previewState: "NEED_CONFIRMATION",
  railIndex: 3,
  detailTab: "Overview",
  dataSource: "fixture",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getJob(id = ui.selectedJobId) {
  return fixtures.find((job) => job.id === id) || fixtures[0];
}

function formatBangkokTime(isoTimestamp) {
  if (!isoTimestamp) return "—";
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(isoTimestamp))} ICT`;
}

function relativeAge(isoTimestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60000));
  return minutes < 1 ? "now" : `${minutes}m`;
}

function workflowRowToCard(row) {
  return {
    id: row.public_ref,
    dbId: row.id,
    state: row.state,
    stateVersion: row.state_version,
    type: row.transaction_type,
    timestamp: formatBangkokTime(row.updated_at || row.created_at),
    age: relativeAge(row.updated_at || row.created_at),
    amount: row.amount === null || row.amount === undefined ? "—" : String(row.amount),
    secondary: row.summary || "Authoritative workflow projection",
    worker: row.worker || "SYSTEM",
    checks: `DB v${row.state_version}`,
  };
}

async function hydrateRuntimeHealth() {
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
      { name: "Telegram Bot", state: telegramHealthy ? "HEALTHY" : "DEGRADED", tone: telegramHealthy ? "green" : "amber", meta: telegramHealthy ? `webhook active · pending ${telegram.webhook.pending_update_count ?? 0}` : "webhook probe unavailable", note: telegramHealthy ? "Canonical webhook is registered." : "Telegram status requires operator attention." },
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

async function hydrateActivityFeed() {
  try {
    const response = await fetch("/api/v1/activity?limit=8", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("ACTIVITY_API_UNAVAILABLE");
    const payload = await response.json();
    runtimeActivity = Array.isArray(payload.data) ? payload.data : [];
    ui.activityCheckedAt = new Date().toISOString();
    renderApp();
  } catch {
    runtimeActivity = [];
    ui.activityCheckedAt = new Date().toISOString();
    renderApp();
  }
}

async function hydrateWorkflowProjection() {
  try {
    const response = await fetch("/api/v1/jobs?limit=25", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("WORKFLOW_API_UNAVAILABLE");
    const payload = await response.json();
    const records = Array.isArray(payload.data) ? payload.data.map(workflowRowToCard) : [];
    if (!records.length) return;
    fixtures = records;
    ui.dataSource = "supabase";
    if (!fixtures.some((job) => job.id === ui.selectedJobId)) ui.selectedJobId = fixtures[0].id;
    ui.previewState = getJob().state;
    ui.railIndex = stateMeta[getJob().state].stage;
    renderApp();
  } catch {
    ui.dataSource = "fixture";
  }
}

function startActivityStream() {
  if (!("EventSource" in window)) return;
  const stream = new EventSource("/api/v1/activity/stream");
  stream.addEventListener("activity", () => window.setTimeout(() => { hydrateWorkflowProjection(); hydrateActivityFeed(); }, 80));
  stream.onerror = () => stream.close();
}

function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

function stateBadge(state, compact = false) {
  const meta = stateMeta[state];
  return `<span class="state-badge tone-${meta.tone} ${compact ? "is-compact" : ""}"><span class="state-mark">${meta.icon}</span><span>${escapeHtml(state)}</span></span>`;
}

function signalDot(tone = "cyan") {
  return `<span class="signal-dot tone-${tone}" aria-hidden="true"></span>`;
}

function maskedAmount(job) {
  return job.amount === "—" ? "Not available" : "฿•••••.••";
}

function formatStage(stage, index) {
  if (index < stage) return "DONE";
  if (index === stage) return "NOW";
  return "NEXT";
}

function renderDesktopTopbar() {
  const fresh = freshnessMeta[ui.freshness];
  return `
    <div class="desktop-topbar">
      <div class="brand-lockup" aria-label="CE VAULT YOUNGBOSS LIVE">
        <span class="brand-signal" aria-hidden="true"><i></i><i></i><i></i></span>
        <div><div class="brand-name">CE<span>//</span>VAULT</div><div class="brand-sub">YOUNGBOSS LIVE / OPERATOR</div></div>
      </div>
      <div class="topbar-status">
        <span class="env-badge">SANDBOX / DRY_RUN</span>
        <span class="freshness-pill tone-${fresh.tone}">${signalDot(fresh.tone)}${fresh.label} · ${fresh.age}</span>
        <span class="role-chip">OPERATOR <span class="role-caret">▾</span></span>
      </div>
      <div class="desktop-actions">
        <button class="top-control is-active" data-freshness="FRESH">Fresh</button>
        <button class="top-control" data-freshness="DEGRADED">Degraded</button>
        <button class="top-control" data-freshness="OFFLINE">Offline</button>
        <button class="top-control" data-action="toggle-pulse" aria-pressed="${ui.activityPulse}"><span class="pulse-dot ${ui.activityPulse ? "is-on" : ""}"></span> Activity</button>
        <button class="icon-button" data-action="open-settings" aria-label="Open settings and system info">⋯</button>
      </div>
    </div>
  `;
}

function renderMobileTopbar() {
  const fresh = freshnessMeta[ui.freshness];
  const job = getJob();
  return `
    <div class="mobile-topbar">
      <div class="mobile-brand"><span class="brand-signal small" aria-hidden="true"><i></i><i></i><i></i></span><span>CE<span>//</span>VAULT</span></div>
      <div class="mobile-status-stack">
        <div class="mobile-status-row"><span class="env-badge compact">SANDBOX</span><span class="freshness-pill tone-${fresh.tone}">${signalDot(fresh.tone)}${fresh.label}</span></div>
        <div class="mobile-worker"><span>WORKER /</span> ${escapeHtml(job.state)} <span class="mobile-age">· ${fresh.age}</span></div>
      </div>
      <button class="mobile-menu-trigger" data-action="open-settings" aria-label="Open status controls and system info">⋯</button>
    </div>
  `;
}

function renderKpis() {
  const kpis = [
    ["ACTIVE JOBS", "08", "+2 since 18:00", "cyan"],
    ["NEEDS CONFIRMATION", "02", "attention first", "amber"],
    ["QUEUE DEPTH", "12", "oldest 50m", "cyan"],
    ["P95 LATENCY", "1.8s", "sandbox sample", "gold"],
    ["ERRORS", "03", "1 unacknowledged", "red"],
    ["SETTLEMENT GATE", "LOCKED", "sandbox only", "gold"],
  ];
  return `<section class="kpi-grid" aria-label="Key performance indicators">${kpis.map(([label, value, note, tone]) => `
    <article class="kpi-card tone-${tone}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></article>
  `).join("")}</section>`;
}

function renderRail() {
  const currentStage = stateMeta[getJob().state].stage;
  const mobileStart = Math.min(Math.max(ui.railIndex - 1, 0), FLOW_STAGES.length - 4);
  const mobileStages = FLOW_STAGES.slice(mobileStart, mobileStart + 4);
  return `
    <section class="panel rail-panel" aria-labelledby="rail-title">
      <div class="panel-heading compact-heading"><div><span class="eyebrow">FLOW CONTROL</span><h2 id="rail-title">Transaction Rail</h2></div><span class="contract-chip">7 STAGES / FROZEN</span></div>
      <div class="desktop-rail" aria-label="Canonical seven-stage flow">${FLOW_STAGES.map((stage, index) => `<div class="rail-stage ${index < currentStage ? "is-done" : ""} ${index === currentStage ? "is-current" : ""}"><div class="rail-node"><span>${index < currentStage ? "✓" : String(index + 1).padStart(2, "0")}</span></div><div class="rail-stage-label">${stage}</div><div class="rail-stage-state">${formatStage(currentStage, index)}</div></div>`).join("")}</div>
      <div class="mobile-rail" aria-label="Four-stage mobile viewport of canonical seven-stage flow">
        <div class="rail-viewport"><div class="rail-mobile-window">${mobileStages.map((stage, offset) => { const index = mobileStart + offset; return `<div class="rail-stage ${index < currentStage ? "is-done" : ""} ${index === currentStage ? "is-current" : ""}"><div class="rail-node"><span>${index < currentStage ? "✓" : String(index + 1).padStart(2, "0")}</span></div><div class="rail-stage-label">${stage}</div><div class="rail-stage-state">${formatStage(currentStage, index)}</div></div>`; }).join("")}</div></div>
        <div class="rail-pager"><button class="icon-button small" data-action="rail-prev" aria-label="Previous rail stage">‹</button><div class="rail-dots">${FLOW_STAGES.map((stage, index) => `<button class="rail-dot ${index === currentStage ? "is-current" : ""} ${index < currentStage ? "is-done" : ""}" data-rail-index="${index}" aria-label="Show ${stage} stage"><span>${index + 1}</span></button>`).join("")}</div><button class="icon-button small" data-action="rail-next" aria-label="Next rail stage">›</button></div>
      </div>
      <div class="rail-footer"><span><span class="rail-key cyan"></span>active stage</span><span><span class="rail-key gold"></span>review/value</span><span><span class="rail-key green"></span>authoritative completed</span></div>
    </section>
  `;
}

function renderQueue() {
  const attentionRank = { NEED_CONFIRMATION: 0, FAILED: 1, TIMEOUT: 2, WAITING: 3 };
  const jobs = [...fixtures].sort((a, b) => (attentionRank[a.state] ?? 4) - (attentionRank[b.state] ?? 4));
  return `
    <section class="panel queue-panel" aria-labelledby="queue-title">
      <div class="panel-heading"><div><span class="eyebrow">ATTENTION QUEUE</span><h2 id="queue-title">Activity Queue</h2></div><div class="queue-count"><strong>${jobs.length}</strong><span>fixtures / 12 states</span></div></div>
      <div class="queue-toolbar"><span class="filter-chip is-active">ATTENTION FIRST</span><span class="filter-chip">ALL TYPES</span><span class="filter-chip">READ ONLY</span></div>
      <div class="queue-list">${jobs.map((job) => {
        const meta = stateMeta[job.state];
        return `<button class="job-card ${ui.selectedJobId === job.id ? "is-selected" : ""}" data-job-id="${job.id}" aria-label="Open details for ${job.id}">
          <div class="job-card-top"><span class="job-ref">${job.id}</span><span class="job-time">${job.timestamp} · ${job.age}</span></div>
          <div class="job-card-main"><div><div class="job-type">${job.type}</div>${stateBadge(job.state)}</div><div class="severity-signal tone-${meta.tone}">${meta.icon}</div></div>
          <div class="job-card-bottom"><span>${job.secondary}</span><span class="job-worker">${job.worker}</span></div>
        </button>`;
      }).join("")}</div>
      <div class="queue-footer"><span>${signalDot("amber")} Attention-first sort is deterministic</span><button class="text-button" data-action="refresh">Refresh view <span aria-hidden="true">↗</span></button></div>
    </section>
  `;
}

function renderTelegram() {
  const state = ui.previewState;
  const meta = stateMeta[state];
  const job = fixtures.find((item) => item.state === state) || fixtures[0];
  const currentStage = meta.stage;
  const progressLabel = meta.progress === null ? "Awaiting authoritative result" : `${meta.progress}% · ${FLOW_STAGES[currentStage]}`;
  const previewActions = state === "NEED_CONFIRMATION"
    ? `<button class="action-button primary" data-action="sandbox-confirm">Confirm in sandbox</button><button class="action-button" data-action="open-job" data-job-id="${job.id}">Review details</button>`
    : state === "COMPLETED"
      ? `<button class="action-button" data-action="open-job" data-job-id="${job.id}">Audit trail</button><button class="action-button" data-action="open-job" data-job-id="${job.id}">Receipt view</button>`
      : `<button class="action-button" data-action="refresh">Refresh</button><button class="action-button" data-action="open-job" data-job-id="${job.id}">Details</button>`;
  return `
    <section class="panel telegram-panel" aria-labelledby="telegram-title">
      <div class="panel-heading"><div><span class="eyebrow">DURABLE OPERATOR SURFACE</span><h2 id="telegram-title">Telegram Preview</h2></div><span class="telegram-status"><span class="pulse-dot ${ui.activityPulse ? "is-on" : ""}"></span> EDIT IN PLACE</span></div>
      <div class="telegram-card">
        <div class="telegram-card-head"><div class="telegram-brand"><span class="telegram-avatar">YB</span><div><strong>YOUNGBOSS LIVE</strong><span>CE VAULT / status card</span></div></div><span class="env-badge compact">SANDBOX</span></div>
        <div class="telegram-state-line"><div>${stateBadge(state)}<div class="telegram-job-ref">${job.id} · ${job.type}</div></div><div class="mascot-placeholder" aria-label="Static mascot placeholder"><span class="mascot-orbit"></span><span>MASCOT<br /><small>STATIC POSE</small></span></div></div>
        <div class="telegram-value-row"><div><span class="micro-label">MASKED AMOUNT</span><strong>${maskedAmount(job)}</strong></div><div><span class="micro-label">UPDATED</span><strong>${job.timestamp}</strong></div></div>
        <div class="telegram-flow-label"><span>CANONICAL FLOW</span><span>${currentStage + 1} / 7</span></div>
        <div class="telegram-flow">${FLOW_STAGES.map((stage, index) => `<div class="telegram-flow-step ${index < currentStage ? "is-done" : ""} ${index === currentStage ? "is-current" : ""}"><span>${index < currentStage ? "✓" : index + 1}</span><small>${stage}</small></div>`).join("")}</div>
        <div class="progress-block"><div class="progress-meta"><span>${progressLabel}</span><span>${meta.label}</span></div><div class="progress-track ${meta.progress === null ? "is-indeterminate" : ""}"><span style="width:${meta.progress ?? 36}%"></span></div><p>${meta.detail}</p></div>
        <div class="inline-keyboard">${previewActions}</div>
        <div class="telegram-safety"><span class="safety-icon">!</span><span><strong>SANDBOX — no live funds moved</strong><small>State preview only · canonical state remains ${state}</small></span></div>
      </div>
      <div class="state-picker-label"><span>PREVIEW STATE SELECTOR</span><span>12 canonical states</span></div>
      <div class="state-picker">${CANONICAL_STATES.map((item) => `<button class="state-pick ${item === state ? "is-selected" : ""} tone-${stateMeta[item].tone}" data-preview-state="${item}" aria-pressed="${item === state}">${item}</button>`).join("")}</div>
    </section>
  `;
}

function renderHealth() {
  const attention = services.filter((service) => service.state !== "HEALTHY");
  const healthy = services.filter((service) => service.state === "HEALTHY");
  const fresh = freshnessMeta[ui.freshness];
  const healthCopy = {
    FRESH: ["Fresh read; degraded services remain visible", "Read surfaces are current. Attention services remain explicitly listed."],
    DEGRADED: ["Meaningful degradation detected", "Read surfaces are available. Operator attention is required."],
    OFFLINE: ["Offline read model", "Latest known state is shown. Refresh is required before trusting new activity."],
  }[ui.freshness];
  const serviceRow = (service) => `<div class="service-row"><div class="service-primary">${signalDot(service.tone)}<div><strong>${service.name}</strong><span>${service.note}</span></div></div><div class="service-status tone-${service.tone}">${service.state}<small>${service.meta}</small></div></div>`;
  return `
    <section class="panel health-panel" aria-labelledby="health-title">
      <div class="panel-heading"><div><span class="eyebrow">SERVICE TELEMETRY</span><h2 id="health-title">Health Stack</h2></div><span class="health-summary tone-${fresh.tone}">${fresh.page}</span></div>
      <div class="health-callout tone-${fresh.tone}"><span class="status-emblem tone-${fresh.tone}">!</span><div><strong>${healthCopy[0]}</strong><span>${healthCopy[1]}</span></div></div>
      <div class="service-list attention-services">${attention.map(serviceRow).join("")}</div>
      <details class="healthy-group"><summary><span>Healthy services</span><span>${healthy.length} grouped</span></summary><div class="service-list">${healthy.map(serviceRow).join("")}</div></details>
      <div class="health-footer"><span>Source <code>runtime API</code></span><span>Checked ${ui.healthCheckedAt ? formatBangkokTime(ui.healthCheckedAt) : "pending"}</span></div>
    </section>
  `;
}

function renderActivityFeed() {
  const items = runtimeActivity.slice(0, 8);
  const labelFor = (entry) => {
    if (entry.event_type === "job.created.v1") return "Sandbox job created";
    if (entry.command_code === "CONFIRM_PROCESS") return "Confirmation recorded";
    if (entry.to_state === "COMPLETED") return "Sandbox workflow completed";
    return entry.event_type === "job.state_changed.v1" ? "Workflow state changed" : "Workflow activity";
  };
  const refFor = (entry) => entry.workflow_jobs?.public_ref || entry.job_id || "workflow";
  const stateFor = (entry) => entry.to_state || entry.workflow_jobs?.state || "—";
  const rows = items.length ? items.map((entry, index) => `<div class="feed-row"><span class="feed-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(labelFor(entry))}</strong><span><code>${escapeHtml(refFor(entry))}</code> · ${escapeHtml(stateFor(entry))}</span></div><time>${escapeHtml(formatBangkokTime(entry.occurred_at).replace(" ICT", ""))}</time></div>`).join("") : `<div class="feed-row"><span class="feed-index">—</span><div><strong>Activity feed unavailable</strong><span>Database-backed workflow remains authoritative.</span></div><time>—</time></div>`;
  const asOf = items[0]?.occurred_at ? formatBangkokTime(items[0].occurred_at) : (ui.activityCheckedAt ? formatBangkokTime(ui.activityCheckedAt) : "pending");
  return `<section class="panel feed-panel" aria-labelledby="feed-title"><div class="panel-heading"><div><span class="eyebrow">READ MODEL / LAST 8</span><h2 id="feed-title">Recent Activity</h2></div><span class="feed-asof">${escapeHtml(asOf)}</span></div><div class="feed-list">${rows}</div><div class="stale-note"><span class="status-emblem tone-cyan">i</span> Live projection from /api/v1/activity. Database-backed workflow remains authoritative.</div></section>`;
}

function renderSystemInfo() {
  return `<div class="drawer-backdrop" id="settings-backdrop" hidden></div><aside class="system-drawer" id="system-drawer" aria-labelledby="system-title" aria-hidden="true"><div class="drawer-handle"></div><div class="drawer-head"><div><span class="eyebrow">SYSTEM / ABOUT</span><h2 id="system-title">Operator controls</h2></div><button class="icon-button" data-action="close-settings" aria-label="Close operator controls">×</button></div><div class="drawer-body"><div class="control-group"><span class="control-label">Demo freshness</span><div class="control-grid">${["FRESH", "DEGRADED", "OFFLINE"].map((value) => `<button class="setting-button ${ui.freshness === value ? "is-active" : ""}" data-freshness="${value}">${value}<small>${freshnessMeta[value].age}</small></button>`).join("")}</div></div><div class="control-group"><span class="control-label">Motion & activity</span><button class="setting-toggle" data-action="toggle-motion" aria-pressed="${ui.reducedMotion}"><span><strong>Reduced motion</strong><small>Static equivalents for ambient feedback</small></span><span class="toggle-track ${ui.reducedMotion ? "is-on" : ""}"><i></i></span></button><button class="setting-toggle" data-action="toggle-pulse" aria-pressed="${ui.activityPulse}"><span><strong>Activity pulse</strong><small>Subtle 6s operator heartbeat</small></span><span class="toggle-track ${ui.activityPulse ? "is-on" : ""}"><i></i></span></button></div><div class="about-block"><span class="eyebrow">ARCHITECTURE NOTE</span><p>The database-backed workflow is the authoritative source in the production contract. This prototype is a deterministic, client-only projection for sandbox review; it has no backend, credentials, provider calls or persistent job writes.</p><div class="about-grid"><div><span>CONTRACT</span><strong>ce-vault.telegram-live-operator.v1</strong></div><div><span>FLAGS</span><strong>LIVE_SETTLEMENT_ENABLED=false</strong></div><div><span>TIMEZONE</span><strong>Asia/Bangkok / UTC stored</strong></div><div><span>TERMINAL</span><strong>Immutable records</strong></div></div></div><div class="drawer-safety"><span class="safety-icon">!</span><strong>SANDBOX — no live funds moved</strong></div></div></aside>`;
}

function renderDetailSheet() {
  const job = getJob();
  const meta = stateMeta[job.state];
  const tabContent = {
    Overview: `<div class="detail-overview"><div class="detail-stat"><span>PUBLIC REF</span><strong>${job.id}</strong></div><div class="detail-stat"><span>TYPE</span><strong>${job.type}</strong></div><div class="detail-stat"><span>AMOUNT VISIBILITY</span><strong>${maskedAmount(job)}</strong></div><div class="detail-stat"><span>VERSION</span><strong>v${job.id.slice(-2)}</strong></div></div><p class="detail-copy">${meta.detail} All displayed values are synthetic sandbox fixtures and remain read-only.</p>`,
    OCR: `<div class="empty-detail"><span class="status-emblem tone-cyan">▤</span><div><strong>OCR proposal surface</strong><p>Evidence fields are masked in this prototype. OCR is untrusted until verification.</p></div></div>`,
    Verification: `<div class="check-list"><div><span class="check-mark tone-green">✓</span><span>Artifact integrity</span><strong>PASS</strong></div><div><span class="check-mark tone-green">✓</span><span>Duplicate fingerprint</span><strong>PASS</strong></div><div><span class="check-mark tone-amber">!</span><span>Operator review</span><strong>REVIEW</strong></div></div>`,
    Processing: `<div class="detail-callout tone-cyan"><strong>Read-only worker view</strong><span>Refresh, details and audit-type actions only. No second confirmation is available.</span></div>`,
    Settlement: `<div class="detail-callout tone-gold"><strong>Sandbox reconciliation preview</strong><span>Settlement records are preview-only. No external money movement is available.</span></div>`,
    Audit: `<div class="audit-lines"><div><code>19:34:12Z</code><span>confirmation.required.v1</span></div><div><code>19:34:11Z</code><span>verification.completed.v1</span></div><div><code>19:33:54Z</code><span>evidence.accepted.v1</span></div></div>`,
    Errors: `<div class="empty-detail"><span class="status-emblem tone-red">!</span><div><strong>${job.checks}</strong><p>Safe error copy only. Raw provider or stack details are not exposed.</p></div></div>`,
  };
  return `<div class="sheet-backdrop" id="sheet-backdrop" hidden><section class="job-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="sheet-handle"></div><header class="sheet-header"><div><span class="eyebrow">JOB DETAIL / READ ONLY</span><h2 id="detail-title">${job.id}</h2></div><div class="sheet-header-actions"><span class="state-badge tone-${meta.tone}">${meta.icon} ${job.state}</span><button class="icon-button" data-action="close-detail" aria-label="Close job details">×</button></div></header><div class="sheet-summary"><span>${job.type}</span><span>${job.timestamp}</span><span>Worker ${job.worker}</span><span class="amount-mask">${maskedAmount(job)}</span></div><div class="detail-tabs" role="tablist" aria-label="Job detail sections">${Object.keys(tabContent).map((tab) => `<button role="tab" aria-selected="${ui.detailTab === tab}" class="detail-tab ${ui.detailTab === tab ? "is-active" : ""}" data-detail-tab="${tab}">${tab}</button>`).join("")}</div><div class="detail-content">${tabContent[ui.detailTab]}</div><div class="detail-safety"><span class="safety-icon">!</span><span>SANDBOX — no live funds moved · terminal states immutable</span></div></section></div>`;
}

function renderMobileActionBar() {
  const job = getJob();
  return `<div class="mobile-action-bar"><div><span class="eyebrow">SELECTED JOB</span><strong>${job.id}</strong><span>${job.state}</span></div><button class="action-button primary" data-action="open-job" data-job-id="${job.id}">Open detail <span aria-hidden="true">↑</span></button></div>`;
}

function renderApp() {
  app.innerHTML = `
    <div class="ambient-grid" aria-hidden="true"></div>
    <div class="app-shell">
      <header class="shell-header">${renderDesktopTopbar()}${renderMobileTopbar()}</header>
      <main id="main-content">
        <section class="safety-banner"><span class="safety-icon">!</span><div><strong>SANDBOX / DRY_RUN</strong><span>No live funds moved · source revision 184 · display Asia/Bangkok</span></div><span class="safety-lock">LOCKED BY CONTRACT</span></section>
        <section class="hero-row"><div><span class="eyebrow">OPERATOR ACTIVITY CENTER / 03 OCT 2026</span><h1>Keep the queue<br /><span>in sight.</span></h1></div><div class="hero-aside"><span class="hero-kicker">CURRENT WORKER</span><strong>${getJob().worker}</strong><span>${getJob().state} · ${freshnessMeta[ui.freshness].page} page health</span></div></section>
        ${renderKpis()}
        ${renderRail()}
        <div class="workspace-grid"><div class="workspace-main">${renderQueue()}${renderActivityFeed()}</div><div class="workspace-side">${renderTelegram()}${renderHealth()}</div></div>
      </main>
      <footer class="site-footer"><span>CE//VAULT · YOUNGBOSS LIVE</span><span>Sandbox fixture / no external operations</span><span>Contract v1 · ${CANONICAL_STATES.length} states · ${FLOW_STAGES.length} stages</span></footer>
    </div>
    ${renderMobileActionBar()}
    ${renderSystemInfo()}
    ${renderDetailSheet()}
  `;
  bindEvents();
}

function openSettings() {
  const drawer = document.querySelector("#system-drawer");
  const backdrop = document.querySelector("#settings-backdrop");
  drawer?.classList.add("is-open");
  drawer?.setAttribute("aria-hidden", "false");
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("drawer-open");
}

function closeSettings() {
  const drawer = document.querySelector("#system-drawer");
  const backdrop = document.querySelector("#settings-backdrop");
  drawer?.classList.remove("is-open");
  drawer?.setAttribute("aria-hidden", "true");
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("drawer-open");
}

function openDetail(jobId, { resetTab = true } = {}) {
  if (jobId) {
    ui.selectedJobId = jobId;
    ui.railIndex = stateMeta[getJob(jobId).state].stage;
  }
  if (resetTab) ui.detailTab = "Overview";
  renderApp();
  const sheet = document.querySelector("#sheet-backdrop");
  if (sheet) sheet.hidden = false;
  requestAnimationFrame(() => sheet?.classList.add("is-open"));
  document.body.classList.add("sheet-open");
}

function closeDetail() {
  const sheet = document.querySelector("#sheet-backdrop");
  sheet?.classList.remove("is-open");
  document.body.classList.remove("sheet-open");
  if (ui.reducedMotion) {
    if (sheet) sheet.hidden = true;
    return;
  }
  window.setTimeout(() => { if (sheet) sheet.hidden = true; }, 280);
}

function setFreshness(value) {
  if (!freshnessMeta[value]) return;
  const shouldReopenSettings = document.querySelector("#system-drawer")?.classList.contains("is-open");
  ui.freshness = value;
  renderApp();
  if (shouldReopenSettings) openSettings();
}

function setPreviewState(value) {
  if (!CANONICAL_STATES.includes(value)) return;
  ui.previewState = value;
  renderApp();
}

function handleAction(action, element) {
  if (action === "open-settings") openSettings();
  if (action === "close-settings") closeSettings();
  if (action === "close-detail") closeDetail();
  if (action === "open-job") openDetail(element.dataset.jobId);
  if (action === "refresh") {
    const button = element;
    const original = button.innerHTML;
    button.innerHTML = "View refreshed <span aria-hidden=\"true\">✓</span>";
    button.classList.add("is-confirmed");
    window.setTimeout(() => { button.innerHTML = original; button.classList.remove("is-confirmed"); }, 1200);
  }
  if (action === "toggle-motion") {
    ui.reducedMotion = !ui.reducedMotion;
    document.body.classList.toggle("reduced-motion", ui.reducedMotion);
    renderApp();
    openSettings();
  }
  if (action === "toggle-pulse") {
    const shouldReopenSettings = document.querySelector("#system-drawer")?.classList.contains("is-open");
    ui.activityPulse = !ui.activityPulse;
    renderApp();
    if (shouldReopenSettings) openSettings();
  }
  if (action === "sandbox-confirm") {
    const button = element;
    button.textContent = "Sandbox review recorded";
    button.classList.add("is-confirmed");
    button.disabled = true;
    window.setTimeout(() => { button.textContent = "Confirm in sandbox"; button.classList.remove("is-confirmed"); button.disabled = false; }, 1800);
  }
  if (action === "rail-prev") ui.railIndex = Math.max(0, ui.railIndex - 1), renderApp();
  if (action === "rail-next") ui.railIndex = Math.min(FLOW_STAGES.length - 1, ui.railIndex + 1), renderApp();
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action, element));
  });
  document.querySelectorAll("[data-freshness]").forEach((element) => {
    element.addEventListener("click", () => setFreshness(element.dataset.freshness));
  });
  document.querySelectorAll(".job-card[data-job-id]").forEach((element) => {
    element.addEventListener("click", () => {
      ui.selectedJobId = element.dataset.jobId;
      renderApp();
      openDetail(element.dataset.jobId);
    });
  });
  document.querySelectorAll("[data-preview-state]").forEach((element) => {
    element.addEventListener("click", () => setPreviewState(element.dataset.previewState));
  });
  document.querySelectorAll("[data-detail-tab]").forEach((element) => {
    element.addEventListener("click", () => { ui.detailTab = element.dataset.detailTab; openDetail(ui.selectedJobId, { resetTab: false }); });
  });
  document.querySelectorAll("[data-rail-index]").forEach((element) => {
    element.addEventListener("click", () => { ui.railIndex = Number(element.dataset.railIndex); renderApp(); });
  });
  document.querySelector("#settings-backdrop")?.addEventListener("click", closeSettings);
  document.querySelector("#sheet-backdrop")?.addEventListener("click", (event) => { if (event.target.id === "sheet-backdrop") closeDetail(); });
}

function assertContract({ checkRenderedActions = false } = {}) {
  if (CANONICAL_STATES.length !== 12) throw new Error("STATE_CONTRACT_INVALID");
  if (new Set(CANONICAL_STATES).size !== 12) throw new Error("STATE_CONTRACT_DUPLICATE");
  if (FLOW_STAGES.join("→") !== "SCAN→OCR→VERIFY→CONFIRM→PROCESS→SETTLEMENT→DONE") throw new Error("FLOW_CONTRACT_INVALID");
  if (LIVE_SETTLEMENT_ENABLED !== false) throw new Error("LIVE_FLAG_MUST_BE_FALSE");
  if (DEMO_FIXTURES.length !== 12 || CANONICAL_STATES.some((state) => !DEMO_FIXTURES.some((job) => job.state === state))) throw new Error("FIXTURES_MUST_COVER_ALL_STATES");
  if (checkRenderedActions) {
    const buttonLabels = [...document.querySelectorAll("button")].map((button) => button.textContent.trim().toUpperCase());
    if (FORBIDDEN_OPERATOR_ACTION_NAMES.some((action) => buttonLabels.includes(action))) throw new Error("FORBIDDEN_ACTION_PRESENT");
  }
}

assertContract();
renderApp();
assertContract({ checkRenderedActions: true });
hydrateWorkflowProjection();
hydrateActivityFeed();
hydrateRuntimeHealth();
window.setInterval(hydrateActivityFeed, 30_000);
window.setInterval(hydrateRuntimeHealth, 30_000);
startActivityStream();

/* CE_BRAND_UI_V3 */
const CE_BRAND_SVG="<svg viewBox=\"0 0 120 64\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><defs><linearGradient id=\"ceg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff2b4\"/><stop offset=\".34\" stop-color=\"#ffd96a\"/><stop offset=\".72\" stop-color=\"#c88a18\"/><stop offset=\"1\" stop-color=\"#fff0a5\"/></linearGradient></defs><path fill=\"url(#ceg)\" d=\"M8 32 28 10h32L48 22H34L25 32l9 10h14l12 12H28L8 32Zm53-22h49L98 22H50L61 10Zm-4 17h47L92 38H46l11-11Zm-7 16h43L81 54H39l11-11Z\"/></svg>";
const CE_ICON_SVGS={"home":"<svg viewBox=\"0 0 24 24\"><path d=\"M3 11.5 12 4l9 7.5V20H15v-6H9v6H3Z\"/></svg>","vault":"<svg viewBox=\"0 0 24 24\"><ellipse cx=\"12\" cy=\"5\" rx=\"7\" ry=\"3\"/><path d=\"M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7\"/></svg>","tx":"<svg viewBox=\"0 0 24 24\"><path d=\"M4 7h13l-3-3m3 3-3 3M20 17H7l3 3m-3-3 3-3\"/></svg>","bank":"<svg viewBox=\"0 0 24 24\"><path d=\"m3 9 9-5 9 5H3Zm2 3h14M6 12v6m4-6v6m4-6v6m4-6v6M3 21h18\"/></svg>","team":"<svg viewBox=\"0 0 24 24\"><circle cx=\"9\" cy=\"8\" r=\"3\"/><circle cx=\"17\" cy=\"9\" r=\"2.5\"/><path d=\"M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14 15c3.4-.4 5.5 1.2 6.5 5\"/></svg>","ai":"<svg viewBox=\"0 0 24 24\"><rect x=\"5\" y=\"7\" width=\"14\" height=\"12\" rx=\"4\"/><path d=\"M9 7V4m6 3V4M8 13h.01M16 13h.01M9 17h6\"/></svg>","report":"<svg viewBox=\"0 0 24 24\"><path d=\"M5 20V10m5 10V5m5 15v-8m5 8V8\"/></svg>","settings":"<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2\"/></svg>"};
const CE_BRAND_CSS=":root{--ce-bg:#050b14;--ce-bg2:#071626;--ce-line:rgba(70,173,255,.22);--ce-blue:#29b6ff;--ce-gold:#f4c85a;--ce-text:#f4f8ff}html,body{background:radial-gradient(circle at 55% -10%,rgba(36,128,203,.18),transparent 38%),linear-gradient(145deg,var(--ce-bg),var(--ce-bg2) 55%,#03070c)!important;color:var(--ce-text)!important}body:before{content:\"\";position:fixed;inset:0;pointer-events:none;z-index:-1;background-image:linear-gradient(rgba(69,151,222,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(69,151,222,.035) 1px,transparent 1px);background-size:32px 32px}.ce-brand-mark{display:inline-flex!important;align-items:center;gap:10px}.ce-brand-mark svg{width:54px;height:31px;filter:drop-shadow(0 0 12px rgba(244,200,90,.35))}.ce-brand-copy{display:flex;flex-direction:column;line-height:1}.ce-brand-copy b{font-size:13px;letter-spacing:.22em;color:#fff}.ce-brand-copy small{margin-top:4px;font-size:8px;letter-spacing:.28em;color:var(--ce-gold)}.ce-menu-icon{width:30px;height:30px;display:inline-grid;place-items:center;border-radius:9px;border:1px solid rgba(58,173,255,.26);background:linear-gradient(145deg,rgba(18,49,75,.88),rgba(4,13,24,.9));flex:0 0 auto}.ce-menu-icon svg{width:17px;height:17px;fill:none;stroke:#dbeeff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.ce-menu-enhanced{display:flex!important;align-items:center!important;gap:10px!important;border-radius:11px!important;transition:.16s ease!important}.ce-menu-enhanced:hover{transform:translateX(2px);background:linear-gradient(90deg,rgba(244,200,90,.12),rgba(32,159,255,.06))!important}.ce-menu-enhanced[aria-current=\"page\"],.ce-menu-enhanced.active,.ce-menu-enhanced.is-active{background:linear-gradient(90deg,rgba(244,200,90,.18),rgba(26,139,227,.10))!important;box-shadow:inset 3px 0 var(--ce-gold)!important}header,nav,aside,[class*=\"sidebar\"],[class*=\"topbar\"],[class*=\"panel\"],[class*=\"card\"],[class*=\"widget\"]{border-color:var(--ce-line)!important}[class*=\"panel\"],[class*=\"card\"],[class*=\"widget\"]{background:linear-gradient(150deg,rgba(11,28,46,.88),rgba(4,12,22,.92))!important;box-shadow:inset 0 1px rgba(255,255,255,.035),0 14px 40px rgba(0,0,0,.18)!important;backdrop-filter:blur(18px)}button,[role=\"button\"],input,select{border-radius:10px!important}code,[class*=\"mono\"],[class*=\"amount\"]{font-variant-numeric:tabular-nums}@media(max-width:720px){.ce-brand-copy{display:none}.ce-brand-mark svg{width:42px}.ce-menu-icon{width:28px;height:28px}.ce-menu-enhanced{gap:6px!important}nav,.bottom-nav,[class*=\"bottom\"]{padding-bottom:max(10px,env(safe-area-inset-bottom))!important}}@media(prefers-reduced-motion:reduce){.ce-menu-enhanced{transition:none!important}.ce-menu-enhanced:hover{transform:none!important}}";
function ceIconFor(text){const t=String(text||"").trim().toLowerCase();if(/หน้าหลัก|home/.test(t))return"home";if(/vault|ฐานข้อมูล/.test(t))return"vault";if(/ธุรกรรม|transaction|รายการ/.test(t))return"tx";if(/บัญชี|account|bank/.test(t))return"bank";if(/ทีมงาน|team/.test(t))return"team";if(/ai agent|agent/.test(t))return"ai";if(/รายงาน|report|analytics/.test(t))return"report";if(/ตั้งค่า|setting/.test(t))return"settings";return null;}
function installCEBrandUI(){if(!document.getElementById("ce-brand-ui-style")){const s=document.createElement("style");s.id="ce-brand-ui-style";s.textContent=CE_BRAND_CSS;document.head.appendChild(s);}const brand=[...document.querySelectorAll("header *,nav *,aside *,[class*=brand] *,[class*=logo] *")];for(const el of brand){if(el.children.length)continue;const t=(el.textContent||"").trim().replace(/\s+/g," ");if(t==="CE VAULT"||t==="CE"||t==="YOUNGBOSS OS"){const h=document.createElement("span");h.className="ce-brand-mark";const icon=document.createElement("span");icon.innerHTML=CE_BRAND_SVG;while(icon.firstChild)h.appendChild(icon.firstChild);const copy=document.createElement("span");copy.className="ce-brand-copy";const b=document.createElement("b");b.textContent="CE VAULT";const small=document.createElement("small");small.textContent="YOUNGBOSS OS";copy.appendChild(b);copy.appendChild(small);h.appendChild(copy);el.replaceWith(h);break;}}const items=[...document.querySelectorAll("nav a,nav button,aside a,aside button,[class*=sidebar] a,[class*=sidebar] button,[class*=bottom] a,[class*=bottom] button")];for(const el of items){if(el.querySelector(".ce-menu-icon"))continue;const key=ceIconFor(el.textContent);if(!key)continue;const i=document.createElement("span");i.className="ce-menu-icon";i.innerHTML=CE_ICON_SVGS[key];el.prepend(i);el.classList.add("ce-menu-enhanced");}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installCEBrandUI,{once:true});else queueMicrotask(installCEBrandUI);
new MutationObserver(function(){installCEBrandUI();}).observe(document.documentElement,{childList:true,subtree:true});

/* CE_POSTHOG_TELEMETRY_V1 */

/* CE_POSTHOG_TELEMETRY_V1 */
const CE_PH_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY || '';
const CE_PH_HOST = (import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
const CE_APP_VERSION = import.meta.env.VITE_CE_APP_VERSION || 'preview';

function ceAnalyticsDistinctId(){
  const key='ce_analytics_anon_id';
  let id=sessionStorage.getItem(key);
  if(!id){id='ce-anon-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));sessionStorage.setItem(key,id);}
  return id;
}
function ceDeviceClass(){return matchMedia('(max-width: 720px)').matches?'mobile':'desktop';}
function ceSafeScreen(){const p=location.pathname||'/';return p.slice(0,80);}
function ceCapture(event, props={}){
  if(!CE_PH_KEY||!event)return;
  const properties={
    distinct_id:ceAnalyticsDistinctId(),
    $process_person_profile:false,
    sandbox:true,
    screen:ceSafeScreen(),
    device_class:ceDeviceClass(),
    app_version:CE_APP_VERSION,
    ...props
  };
  fetch(CE_PH_HOST+'/capture/',{
    method:'POST',
    headers:{'content-type':'application/json'},
    keepalive:true,
    body:JSON.stringify({api_key:CE_PH_KEY,event,properties})
  }).catch(()=>{});
}
function ceActionKey(el){
  const analytics=(el.closest?.('[data-ce-analytics]')?.getAttribute('data-ce-analytics')||'').toLowerCase();
  if(/^[a-z0-9_-]{1,40}$/.test(analytics))return analytics;
  const t=(el.closest?.('a,button,[role=button]')?.textContent||'').toLowerCase();
  if(/home|หน้าหลัก/.test(t))return'home';
  if(/vault|ฐานข้อมูล/.test(t))return'vault';
  if(/transaction|ธุรกรรม|รายการ/.test(t))return'transactions';
  if(/account|bank|บัญชี/.test(t))return'bank';
  if(/team|ทีมงาน/.test(t))return'team';
  if(/agent|ai/.test(t))return'ai';
  if(/report|analytics|รายงาน/.test(t))return'report';
  if(/setting|ตั้งค่า/.test(t))return'settings';
  if(/confirm|ยืนยัน/.test(t))return'confirm';
  if(/cancel|ยกเลิก/.test(t))return'cancel';
  if(/add|เพิ่ม/.test(t))return'add';
  if(/save|บันทึก/.test(t))return'save';
  return'other';
}
function installCEAnalytics(){
  ceCapture('ce_screen_viewed');
  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target:null;
    const control=target?.closest?.('a,button,[role=button]');
    if(!control)return;
    const action=ceActionKey(control);
    const nav=!!control.closest('nav,aside,[class*=sidebar],[class*=bottom]');
    ceCapture(nav?'ce_nav_clicked':'ce_action_started',{action});
  },{capture:true});
  window.addEventListener('error',(event)=>{ceCapture('ce_ui_error_seen',{result:'error',error_kind:event.error?.name||'Error'});});
  window.addEventListener('unhandledrejection',(event)=>{ceCapture('ce_ui_error_seen',{result:'rejection',error_kind:event.reason?.name||typeof event.reason||'unknown'});});
  setTimeout(async()=>{
    try{
      const r=await fetch('/api/v1/health',{headers:{accept:'application/json'}});
      ceCapture('ce_runtime_health_seen',{result:r.ok?'ok':'error',state:String(r.status)});
    }catch{ceCapture('ce_runtime_health_seen',{result:'unreachable',state:'network'});}
  },1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCEAnalytics,{once:true});else queueMicrotask(installCEAnalytics);

