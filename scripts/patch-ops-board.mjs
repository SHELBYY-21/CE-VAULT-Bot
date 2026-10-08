import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'appsrc');
const repositoryPath = path.join(appRoot, 'server', 'repositories', 'supabase.mjs');
const serverPath = path.join(appRoot, 'server', 'index.mjs');
const indexPath = path.join(appRoot, 'index.html');
const srcPath = path.join(appRoot, 'src');
const testsPath = path.join(appRoot, 'tests');

function replaceOnce(source, needle, replacement, errorCode) {
  if (!source.includes(needle)) throw new Error(errorCode);
  return source.replace(needle, replacement);
}

const opsSummary = String.raw`const ZERO = Object.freeze({ coefficient: 0n, scale: 0 });

function decimal(value) {
  const raw = String(value ?? '0').trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error('INVALID_DECIMAL');
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] || '';
  const digits = (match[2] + fraction).replace(/^0+(?=\d)/, '') || '0';
  return { coefficient: BigInt(digits) * sign, scale: fraction.length };
}

function pow10(n) {
  return 10n ** BigInt(n);
}

function align(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * pow10(scale - left.scale),
    right.coefficient * pow10(scale - right.scale),
    scale,
  ];
}

export function addDecimal(leftValue, rightValue) {
  const [left, right, scale] = align(decimal(leftValue), decimal(rightValue));
  return renderDecimal({ coefficient: left + right, scale });
}

export function subtractDecimal(leftValue, rightValue) {
  const [left, right, scale] = align(decimal(leftValue), decimal(rightValue));
  return renderDecimal({ coefficient: left - right, scale });
}

export function isPositiveDecimal(value) {
  return decimal(value).coefficient > 0n;
}

export function sumDecimals(values) {
  return values.reduce((total, value) => addDecimal(total, value ?? '0'), '0');
}

export function renderDecimal(parts) {
  let coefficient = parts.coefficient;
  const negative = coefficient < 0n;
  if (negative) coefficient = -coefficient;
  let digits = coefficient.toString();
  if (parts.scale === 0) return (negative ? '-' : '') + digits;
  if (digits.length <= parts.scale) digits = digits.padStart(parts.scale + 1, '0');
  const integer = digits.slice(0, -parts.scale) || '0';
  const fraction = digits.slice(-parts.scale).replace(/0+$/, '');
  return (negative ? '-' : '') + integer + (fraction ? '.' + fraction : '');
}

function bangkokDateKey(isoTimestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(isoTimestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType.year + '-' + byType.month + '-' + byType.day;
}

function maskedReference(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 4) return '••••';
  return '••••' + text.slice(-4);
}

function safeRecentTransaction(row) {
  return {
    reference: maskedReference(row.ledger_ref),
    type: row.type,
    status: row.status,
    thb_amount: String(row.thb_amount ?? '0'),
    expected_usdt: String(row.expected_usdt ?? '0'),
    sent_usdt: String(row.sent_usdt ?? '0'),
    delta_usdt: String(row.delta_usdt ?? '0'),
    room_name: row.room_name || null,
    bank_match_result: row.bank_match_result || null,
    is_stale_slip: row.is_stale_slip === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function safePendingSlip(row) {
  return {
    reference: maskedReference(row.ledger_ref || row.short_ref),
    status: row.status,
    thb_in: row.thb_in == null ? null : String(row.thb_in),
    should_send: row.should_send == null ? null : String(row.should_send),
    desk_rate: row.desk_rate == null ? null : String(row.desk_rate),
    market_rate: row.mkt_rate == null ? null : String(row.mkt_rate),
    bank: row.bank || null,
    account_masked: row.account_masked || null,
    pin_match: row.pin_match === true,
    ocr_confidence: row.ocr_confidence == null ? null : String(row.ocr_confidence),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function buildOpsOverview({
  transactions = [],
  pendingSlips = [],
  rates = [],
  cycles = [],
  bankAccounts = [],
  exceptions = [],
  now = new Date().toISOString(),
  transactionLimit = 1000,
} = {}) {
  const businessDate = bangkokDateKey(now);
  const today = transactions.filter((row) => row?.created_at && bangkokDateKey(row.created_at) === businessDate && row.is_reversed !== true);
  const thbIn = sumDecimals(today.filter((row) => row.type === 'THB_DEPOSIT').map((row) => row.thb_amount ?? '0'));
  const sentUsdt = sumDecimals(today.map((row) => row.sent_usdt ?? '0'));
  const pendingUsdt = sumDecimals(today.map((row) => {
    const delta = subtractDecimal(row.expected_usdt ?? '0', row.sent_usdt ?? '0');
    return isPositiveDecimal(delta) ? delta : '0';
  }));
  const bankBalance = sumDecimals(bankAccounts.map((row) => row.current_balance ?? '0'));
  const staleSlips = today.filter((row) => row.is_stale_slip === true).length;
  const latestRate = rates[0] || null;
  const activeCycle = cycles[0] || null;

  return {
    generated_at: now,
    business_date: businessDate,
    mode: 'READ_ONLY',
    kpis: {
      thb_in: thbIn,
      sent_usdt: sentUsdt,
      pending_usdt: pendingUsdt,
      transactions: today.length,
      pending_slips: pendingSlips.length,
      open_exceptions: exceptions.length,
      stale_slips: staleSlips,
      bank_balance_thb: bankBalance,
    },
    rate: latestRate ? {
      sell_rate: String(latestRate.sell_rate ?? '0'),
      market_usdt_rate: String(latestRate.market_usdt_rate ?? '0'),
      created_at: latestRate.created_at,
    } : null,
    cycle: activeCycle ? {
      cycle_number: activeCycle.cycle_number,
      status: activeCycle.status,
      limit_thb: String(activeCycle.limit_thb ?? '0'),
      created_at: activeCycle.created_at,
    } : null,
    banks: bankAccounts.map((row) => ({
      label: row.label || null,
      bank_name: row.bank_name || null,
      current_balance: String(row.current_balance ?? '0'),
    })),
    recent_transactions: transactions.slice(0, 25).map(safeRecentTransaction),
    pending_slips: pendingSlips.slice(0, 25).map(safePendingSlip),
    coverage: {
      transactions_scanned: transactions.length,
      transactions_capped: transactions.length >= transactionLimit,
      note: transactions.length >= transactionLimit ? 'Current-day totals may be incomplete because the read cap was reached.' : null,
    },
  };
}
`;
writeFileSync(path.join(appRoot, 'server', 'ops-summary.mjs'), opsSummary);

let repository = readFileSync(repositoryPath, 'utf8');
const repositoryAnchor = '  return Object.freeze({\n    async listJobs(limit = 25) {';
const repositoryMethods = String.raw`  return Object.freeze({
    async listOpsTransactions(limit = 1000) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 1000));
      return ensureData(await db.from("transactions")
        .select("type,status,thb_amount,expected_usdt,sent_usdt,delta_usdt,room_name,bank_match_result,is_stale_slip,is_reversed,ledger_ref,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(safeLimit));
    },
    async listOpsPendingSlips(limit = 100) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
      return ensureData(await db.from("pending_slips")
        .select("short_ref,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(safeLimit));
    },
    async listOpsRates() {
      return ensureData(await db.from("rates")
        .select("sell_rate,market_usdt_rate,created_at")
        .order("created_at", { ascending: false })
        .limit(1));
    },
    async listOpsOpenCycles() {
      return ensureData(await db.from("vault_cycles")
        .select("cycle_number,status,limit_thb,created_at")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(1));
    },
    async listOpsBankAccounts() {
      return ensureData(await db.from("bank_accounts")
        .select("label,bank_name,current_balance")
        .order("updated_at", { ascending: false })
        .limit(100));
    },
    async listOpsOpenExceptions() {
      return ensureData(await db.from("settlement_exceptions")
        .select("status,exception_type,created_at")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(100));
    },
    async listJobs(limit = 25) {`;
repository = replaceOnce(repository, repositoryAnchor, repositoryMethods, 'OPS_REPOSITORY_ANCHOR_NOT_FOUND');
writeFileSync(repositoryPath, repository);

let server = readFileSync(serverPath, 'utf8');
server = replaceOnce(
  server,
  'import { runSandboxE2E } from "./e2e.mjs";',
  'import { runSandboxE2E } from "./e2e.mjs";\nimport { buildOpsOverview } from "./ops-summary.mjs";',
  'OPS_SERVER_IMPORT_ANCHOR_NOT_FOUND',
);
const jobsRouteAnchor = 'app.get("/api/v1/jobs", async (req, res) => {';
const opsRoute = String.raw`app.get("/api/v1/ops/overview", async (req, res) => {
  if (!requireRepository(req, res)) return;
  try {
    const transactionLimit = 1000;
    const [transactions, pendingSlips, rates, cycles, bankAccounts, exceptions] = await Promise.all([
      repository.listOpsTransactions(transactionLimit),
      repository.listOpsPendingSlips(100),
      repository.listOpsRates(),
      repository.listOpsOpenCycles(),
      repository.listOpsBankAccounts(),
      repository.listOpsOpenExceptions(),
    ]);
    res.set("Cache-Control", "no-store").json({
      data: buildOpsOverview({ transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, transactionLimit }),
    });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.get("/api/v1/jobs", async (req, res) => {`;
server = replaceOnce(server, jobsRouteAnchor, opsRoute, 'OPS_SERVER_ROUTE_ANCHOR_NOT_FOUND');
writeFileSync(serverPath, server);

const opsMain = String.raw`import './ops.css';

const app = document.querySelector('#app');
const state = { overview: null, health: null, telegram: null, loading: true, error: null, refreshedAt: null };

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function decimalText(value, unit) {
  const raw = String(value ?? '0');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return '—';
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (match[3] || '').replace(/0+$/, '');
  return (match[1] || '') + integer + (fraction ? '.' + fraction : '') + (unit ? ' ' + unit : '');
}

function timeBangkok(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function statusTone(status) {
  const value = String(status || '').toUpperCase();
  if (['FAILED', 'REJECTED', 'ERROR'].some((part) => value.includes(part))) return 'danger';
  if (['PENDING', 'WAIT', 'REVIEW', 'OCR', 'OPEN'].some((part) => value.includes(part))) return 'warning';
  if (['DONE', 'COMPLETED', 'CONFIRMED', 'SENT', 'SETTLED'].some((part) => value.includes(part))) return 'success';
  return 'neutral';
}

function kpi(label, value, note, tone) {
  return '<article class="kpi ' + tone + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(note) + '</small></article>';
}

function empty(message) {
  return '<div class="empty"><strong>ยังไม่มีข้อมูล</strong><span>' + esc(message) + '</span></div>';
}

function transactionRows(items) {
  if (!items.length) return empty('เมื่อมีรายการจริงจาก transactions ระบบจะแสดงที่นี่โดยอัตโนมัติ');
  return '<div class="rows">' + items.map(function (item) {
    return '<article class="row"><div><strong>' + esc(item.reference || 'ไม่มีเลขอ้างอิง') + '</strong><span>' + esc(item.type || '—') + ' · ' + esc(timeBangkok(item.updated_at || item.created_at)) + '</span></div><div class="amount"><strong>' + esc(decimalText(item.thb_amount, 'THB')) + '</strong><span>คาดส่ง ' + esc(decimalText(item.expected_usdt, 'USDT')) + ' · ส่งแล้ว ' + esc(decimalText(item.sent_usdt, 'USDT')) + '</span></div><span class="pill ' + statusTone(item.status) + '">' + esc(item.status || 'UNKNOWN') + '</span></article>';
  }).join('') + '</div>';
}

function pendingRows(items) {
  if (!items.length) return empty('pending_slips = 0 ไม่มีสลิปรอตรวจในฐานข้อมูล');
  return '<div class="rows">' + items.map(function (item) {
    return '<article class="row"><div><strong>' + esc(item.reference || 'สลิปไม่มีเลขอ้างอิง') + '</strong><span>' + esc(item.bank || 'ธนาคารไม่ระบุ') + ' · ' + esc(item.account_masked || 'บัญชีไม่ระบุ') + '</span></div><div class="amount"><strong>' + esc(decimalText(item.thb_in, 'THB')) + '</strong><span>ต้องส่ง ' + esc(decimalText(item.should_send, 'USDT')) + '</span></div><span class="pill ' + statusTone(item.status) + '">' + esc(item.status || 'PENDING') + '</span></article>';
  }).join('') + '</div>';
}

function serviceRow(name, ok, detail) {
  return '<div class="service"><span class="dot ' + (ok ? 'ok' : 'warn') + '"></span><div><strong>' + esc(name) + '</strong><span>' + esc(detail) + '</span></div><b>' + (ok ? 'OK' : 'CHECK') + '</b></div>';
}

function workflowRail() {
  const steps = [
    ['01', 'OCR', 'READ SLIP', 'cyan'],
    ['02', 'MATCH', 'VERIFY', 'gold'],
    ['03', 'IN', 'RECORD', 'success'],
    ['04', 'WAIT', 'USDT', 'warning'],
    ['05', 'DONE', 'COMPLETE', 'success'],
  ];
  return '<section class="workflow-shell"><div class="workflow-heading"><div><span class="eyebrow">CE EMPIRE · WEB FLOW</span><h2>BANK SLIP → USDT</h2></div><span class="readonly">READ-ONLY VIEW</span></div><div class="workflow-rail">' + steps.map(function (step) {
    return '<article class="flow-step ' + step[3] + '"><span class="flow-index">' + step[0] + '</span><strong>' + step[1] + '</strong><small>' + step[2] + '</small></article>';
  }).join('<span class="flow-arrow">›</span>') + '</div></section>';
}

function render() {
  if (state.loading) {
    app.innerHTML = '<main class="shell"><div class="loading">กำลังอ่านข้อมูลจริงจาก CE VAULT…</div></main>';
    return;
  }
  const o = state.overview;
  if (!o) {
    app.innerHTML = '<main class="shell"><header class="top"><div><span class="brand">CE VAULT</span><small>OPERATIONS / READ-ONLY</small></div><button id="refresh">ลองใหม่</button></header><section class="error"><strong>โหลด Operational Board ไม่สำเร็จ</strong><span>' + esc(state.error || 'ไม่ทราบสาเหตุ') + '</span></section></main>';
    document.querySelector('#refresh')?.addEventListener('click', refresh);
    return;
  }
  const k = o.kpis || {};
  const rate = o.rate;
  const cycle = o.cycle;
  const apiOk = state.health?.mode === 'SANDBOX' && state.health?.database === 'CONFIGURED';
  const telegramOk = Boolean(state.telegram?.configured && state.telegram?.webhook?.url);
  const coverageWarn = o.coverage?.transactions_capped ? '<div class="notice warning">ยอดวันนี้อาจไม่ครบ: อ่านถึงขีดจำกัด ' + esc(o.coverage.transactions_scanned) + ' รายการแล้ว</div>' : '';
  app.innerHTML = [
    '<main class="shell">',
    '<header class="top"><div class="identity"><span class="brand">CE EMPIRE</span><small>VAULT · OPERATIONS / READ-ONLY</small></div><div class="top-actions"><span class="mode">SECURE / FAST / RELIABLE</span><button id="refresh">รีเฟรช</button></div></header>',
    '<section class="hero"><div><span class="eyebrow">CE EMPIRE · MONEY CONTROL</span><h1>BANK SLIP → USDT</h1><p>Source of truth: Supabase operational tables · อัปเดต ' + esc(timeBangkok(o.generated_at)) + '</p></div><div class="date">' + esc(o.business_date) + '</div></section>',
    coverageWarn,
    workflowRail(),
    '<section class="kpis">',
      kpi('ยอดรับวันนี้', decimalText(k.thb_in, 'THB'), String(k.transactions || 0) + ' รายการวันนี้', 'gold'),
      kpi('ส่ง USDT แล้ว', decimalText(k.sent_usdt, 'USDT'), 'จาก sent_usdt ที่บันทึกจริง', 'cyan'),
      kpi('รอส่ง USDT', decimalText(k.pending_usdt, 'USDT'), 'expected_usdt − sent_usdt เฉพาะค่าบวก', 'warning'),
      kpi('สลิปรอตรวจ', String(k.pending_slips || 0), 'อ่านจาก pending_slips', 'cyan'),
      kpi('Exceptions เปิด', String(k.open_exceptions || 0), 'blocking/review ที่ status OPEN', k.open_exceptions ? 'warning' : 'success'),
      kpi('ยอดบัญชีรวม', decimalText(k.bank_balance_thb, 'THB'), 'รวม current_balance โดยไม่เปิดเลขบัญชี', 'gold'),
    '</section>',
    '<section class="context-grid">',
      '<article class="context"><span>Cycle</span><strong>' + esc(cycle ? 'CE' + cycle.cycle_number : 'ยังไม่มี OPEN cycle') + '</strong><small>' + esc(cycle ? cycle.status + ' · limit ' + decimalText(cycle.limit_thb, 'THB') : 'พร้อมเริ่มใหม่เมื่อมี cycle จริง') + '</small></article>',
      '<article class="context"><span>Desk / Sell Rate</span><strong>' + esc(rate ? decimalText(rate.sell_rate, 'THB') : '—') + '</strong><small>' + esc(rate ? 'อัปเดต ' + timeBangkok(rate.created_at) : 'ยังไม่มี rate') + '</small></article>',
      '<article class="context"><span>Market USDT Rate</span><strong>' + esc(rate ? decimalText(rate.market_usdt_rate, 'THB') : '—') + '</strong><small>แสดงค่าจาก rates โดยไม่คำนวณแทน</small></article>',
      '<article class="context"><span>Stale Slip</span><strong>' + esc(String(k.stale_slips || 0)) + '</strong><small>รายการวันนี้ที่ is_stale_slip=true</small></article>',
    '</section>',
    '<section class="two-col">',
      '<article class="panel smart-inbox"><div class="heading"><div><span class="eyebrow">SMART INBOX</span><h2>งานที่ต้องจัดการ</h2></div><b>' + esc(String(k.pending_slips || 0)) + '</b></div>' + pendingRows(o.pending_slips || []) + '</article>',
      '<article class="panel"><div class="heading"><div><span class="eyebrow">RECENT</span><h2>ธุรกรรมล่าสุด</h2></div><b>' + esc(String((o.recent_transactions || []).length)) + '</b></div>' + transactionRows(o.recent_transactions || []) + '</article>',
    '</section>',
    '<section class="panel"><div class="heading"><div><span class="eyebrow">SYSTEM</span><h2>สถานะระบบ</h2></div><span class="readonly">READ-ONLY</span></div><div class="services">',
      serviceRow('Workflow API', apiOk, apiOk ? 'SANDBOX / LOCKED' : 'ตรวจ health endpoint'),
      serviceRow('Supabase', state.health?.database === 'CONFIGURED', state.health?.database || 'unknown'),
      serviceRow('Telegram Webhook', telegramOk, telegramOk ? 'registered · pending ' + String(state.telegram.webhook.pending_update_count ?? 0) : 'ตรวจ webhook'),
      serviceRow('Settlement Gate', state.health?.live_settlement_enabled === false, 'live settlement disabled'),
    '</div></section>',
    '<footer>CE EMPIRE · CE VAULT · ใช้ข้อมูลจริงเท่านั้น · ไม่มี fake balance / fake transaction / fake completion</footer>',
    '</main>'
  ].join('');
  document.querySelector('#refresh')?.addEventListener('click', refresh);
}

async function jsonOrNull(response) {
  if (!response.ok) return null;
  return response.json();
}

async function refresh() {
  state.loading = !state.overview;
  state.error = null;
  render();
  try {
    const results = await Promise.allSettled([
      fetch('/api/v1/ops/overview', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(jsonOrNull),
      fetch('/api/v1/health', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(jsonOrNull),
      fetch('/api/v1/telegram/status', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(jsonOrNull),
    ]);
    const opsPayload = results[0].status === 'fulfilled' ? results[0].value : null;
    if (!opsPayload?.data) throw new Error('OPS_OVERVIEW_UNAVAILABLE');
    state.overview = opsPayload.data;
    state.health = results[1].status === 'fulfilled' ? results[1].value : null;
    state.telegram = results[2].status === 'fulfilled' ? results[2].value : null;
    state.refreshedAt = new Date().toISOString();
  } catch (error) {
    state.error = error?.message || 'OPS_OVERVIEW_UNAVAILABLE';
  } finally {
    state.loading = false;
    render();
  }
}

render();
refresh();
window.setInterval(refresh, 30_000);
`;
writeFileSync(path.join(srcPath, 'ops-main.js'), opsMain);

const opsCss = String.raw`:root{font-family:Inter,Manrope,"Noto Sans Thai",system-ui,sans-serif;color:#eef6fa;background:#071019;font-synthesis:none;--void:#071019;--navy:#0b1623;--surface:#101e2d;--raised:#14263a;--border:#234057;--cyan:#35e7ff;--gold:#f3c96b;--gold2:#ffe2a0;--muted:#91a7b8;--success:#4ee28a;--warning:#ffbf4d;--danger:#ff5f65}*{box-sizing:border-box}body{margin:0;min-width:320px;background:radial-gradient(circle at 50% -20%,#14314b 0,transparent 38%),linear-gradient(180deg,#071019,#08131f 58%,#050b11);color:#eef6fa}button{font:inherit;min-height:44px;border:1px solid var(--border);border-radius:10px;background:#13263a;color:#eef6fa;padding:0 16px;cursor:pointer}button:hover{border-color:var(--cyan)}.shell{width:min(1440px,100%);margin:auto;padding:16px 20px 40px}.top{position:sticky;top:0;z-index:5;margin:-16px -20px 0;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(35,64,87,.8);background:rgba(7,16,25,.94);backdrop-filter:blur(14px)}.identity{display:flex;flex-direction:column}.brand{font-weight:900;letter-spacing:.16em;color:var(--gold2)}.identity small{color:var(--muted);font-size:11px;letter-spacing:.12em;margin-top:3px}.top-actions{display:flex;gap:10px;align-items:center}.mode,.readonly{font-size:12px;color:var(--cyan);border:1px solid rgba(50,217,244,.25);padding:7px 10px;border-radius:999px}.hero{display:flex;justify-content:space-between;align-items:end;padding:28px 2px 16px}.eyebrow{font-size:11px;letter-spacing:.14em;color:var(--cyan)}h1,h2,p{margin:0}h1{font-size:clamp(25px,4vw,42px);margin-top:5px}.hero p{color:var(--muted);margin-top:8px;font-size:13px}.date{font:700 14px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gold2)}.notice{padding:10px 12px;border:1px solid rgba(255,191,77,.35);background:rgba(255,191,77,.08);border-radius:10px;margin-bottom:12px;color:#ffe0a0}.workflow-shell{margin:8px 0 14px;padding:14px;border:1px solid rgba(53,231,255,.28);border-radius:16px;background:linear-gradient(145deg,rgba(9,24,38,.96),rgba(8,17,28,.96));box-shadow:0 0 0 1px rgba(243,201,107,.06),0 18px 42px rgba(0,0,0,.2)}.workflow-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.workflow-heading h2{font-size:17px;margin-top:3px}.workflow-rail{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr auto 1fr;gap:8px;align-items:stretch}.flow-step{min-width:0;padding:12px;border:1px solid rgba(35,64,87,.85);border-radius:12px;background:linear-gradient(180deg,rgba(18,37,55,.92),rgba(9,20,31,.94));display:grid;gap:4px}.flow-step .flow-index{font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}.flow-step strong{font-size:14px;letter-spacing:.06em}.flow-step small{font-size:9px;letter-spacing:.12em;color:var(--muted)}.flow-step.cyan{border-color:rgba(53,231,255,.34);box-shadow:inset 0 1px 0 rgba(53,231,255,.08)}.flow-step.cyan strong{color:var(--cyan)}.flow-step.gold{border-color:rgba(243,201,107,.34)}.flow-step.gold strong{color:var(--gold)}.flow-step.success{border-color:rgba(78,226,138,.28)}.flow-step.success strong{color:var(--success)}.flow-step.warning{border-color:rgba(255,191,77,.32)}.flow-step.warning strong{color:var(--warning)}.flow-arrow{align-self:center;color:var(--gold);font-size:24px;opacity:.85}.smart-inbox{border-color:rgba(53,231,255,.26)}.kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.kpi,.context,.panel{background:linear-gradient(150deg,rgba(16,30,45,.96),rgba(9,20,31,.96));border:1px solid var(--border);border-radius:14px;box-shadow:0 14px 30px rgba(0,0,0,.16)}.kpi{padding:14px;min-height:118px;display:flex;flex-direction:column}.kpi span,.context span{font-size:12px;color:var(--muted)}.kpi strong{font:750 21px ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:auto}.kpi small{font-size:11px;color:var(--muted);margin-top:5px}.kpi.gold strong{color:var(--gold2)}.kpi.cyan strong{color:var(--cyan)}.kpi.warning strong{color:var(--warning)}.kpi.success strong{color:var(--success)}.context-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}.context{padding:14px}.context strong{display:block;margin-top:8px;font:700 16px ui-monospace,SFMono-Regular,Menlo,monospace}.context small{display:block;margin-top:5px;color:var(--muted)}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.panel{padding:14px;margin-top:12px}.two-col .panel{margin-top:0}.heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.heading h2{font-size:18px;margin-top:3px}.heading>b{font:700 14px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gold2)}.rows{display:flex;flex-direction:column;gap:7px}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,.75fr) auto;gap:12px;align-items:center;padding:11px;border:1px solid rgba(35,64,87,.72);border-radius:10px;background:rgba(8,20,31,.72)}.row div{min-width:0}.row strong{font-size:13px}.row div>span{display:block;color:var(--muted);font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.amount{text-align:right}.amount strong{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gold2)}.pill{justify-self:end;font-size:10px;border-radius:999px;padding:5px 8px;border:1px solid var(--border);white-space:nowrap}.pill.success{color:var(--success);border-color:rgba(66,213,154,.3)}.pill.warning{color:var(--warning);border-color:rgba(242,184,75,.3)}.pill.danger{color:var(--danger);border-color:rgba(238,107,114,.3)}.pill.neutral{color:var(--muted)}.empty{min-height:130px;display:grid;place-content:center;text-align:center;border:1px dashed var(--border);border-radius:10px}.empty strong{color:#d7e5ee}.empty span{font-size:12px;color:var(--muted);margin-top:5px}.services{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.service{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:10px;border:1px solid rgba(35,64,87,.65);border-radius:10px}.dot{width:8px;height:8px;border-radius:50%}.dot.ok{background:var(--success);box-shadow:0 0 12px rgba(66,213,154,.35)}.dot.warn{background:var(--warning)}.service div span{display:block;color:var(--muted);font-size:10px;margin-top:3px}.service b{font-size:10px;color:var(--cyan)}footer{text-align:center;color:#60798b;font-size:11px;padding:20px}.loading,.error{margin:18vh auto;max-width:600px;padding:26px;border:1px solid var(--border);border-radius:14px;background:var(--surface);text-align:center}.error{display:flex;flex-direction:column;gap:7px}.error span{color:var(--muted)}@media(max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}.services{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.shell{padding:12px 12px 28px}.workflow-heading{align-items:flex-start}.workflow-rail{grid-template-columns:1fr}.flow-arrow{display:none}.flow-step{grid-template-columns:auto 1fr auto;align-items:center}.flow-step small{text-align:right}.top{margin:-12px -12px 0;padding:10px 12px}.mode{display:none}.hero{align-items:start}.date{font-size:11px}.kpis{grid-template-columns:repeat(2,1fr)}.context-grid{grid-template-columns:repeat(2,1fr)}.two-col{grid-template-columns:1fr}.services{grid-template-columns:1fr}.row{grid-template-columns:1fr auto}.amount{text-align:left}.row>.pill{grid-column:2;grid-row:1/3}.kpi{min-height:105px}.kpi strong{font-size:18px}}@media(max-width:390px){.kpis,.context-grid{grid-template-columns:1fr}.brand{font-size:14px}.top button{padding:0 12px}.hero{padding-top:20px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}`;
writeFileSync(path.join(srcPath, 'ops.css'), opsCss);

const indexHtml = String.raw`<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <meta name="theme-color" content="#071019" />
    <meta name="description" content="CE VAULT operational read-only dashboard" />
    <title>CE VAULT · Operations</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/ops-main.js"></script>
  </body>
</html>`;
writeFileSync(indexPath, indexHtml);

const opsTests = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimal, subtractDecimal, sumDecimals, buildOpsOverview } from '../server/ops-summary.mjs';

test('exact decimal helpers do not lose precision', () => {
  assert.equal(addDecimal('0.1', '0.2'), '0.3');
  assert.equal(subtractDecimal('1000000000000000000.000001', '0.000001'), '1000000000000000000');
  assert.equal(sumDecimals(['0.1', '0.2', '999999999999999999.7']), '1000000000000000000');
});

test('overview uses Asia/Bangkok business date and exact financial sums', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T01:00:00Z',
    transactions: [
      { type: 'THB_DEPOSIT', thb_amount: '100.10', expected_usdt: '3.1', sent_usdt: '1.05', created_at: '2026-10-05T18:30:00Z', is_reversed: false },
      { type: 'THB_DEPOSIT', thb_amount: '0.20', expected_usdt: '1.2', sent_usdt: '1.2', created_at: '2026-10-05T19:00:00Z', is_reversed: false },
      { type: 'THB_DEPOSIT', thb_amount: '999', expected_usdt: '9', sent_usdt: '9', created_at: '2026-10-05T16:00:00Z', is_reversed: false },
    ],
  });
  assert.equal(data.business_date, '2026-10-06');
  assert.equal(data.kpis.thb_in, '100.3');
  assert.equal(data.kpis.sent_usdt, '2.25');
  assert.equal(data.kpis.pending_usdt, '2.05');
  assert.equal(data.kpis.transactions, 2);
});

test('reversed rows are excluded from current-day totals', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T01:00:00Z',
    transactions: [{ type: 'THB_DEPOSIT', thb_amount: '500', expected_usdt: '10', sent_usdt: '0', created_at: '2026-10-05T19:00:00Z', is_reversed: true }],
  });
  assert.equal(data.kpis.thb_in, '0');
  assert.equal(data.kpis.pending_usdt, '0');
  assert.equal(data.kpis.transactions, 0);
});

test('board response masks ledger references and never returns full bank account numbers', () => {
  const data = buildOpsOverview({
    now: '2026-10-06T01:00:00Z',
    transactions: [{ ledger_ref: 'CE-20261006-123456', type: 'THB_DEPOSIT', thb_amount: '1', expected_usdt: '0', sent_usdt: '0', created_at: '2026-10-05T19:00:00Z' }],
    bankAccounts: [{ label: 'Primary', bank_name: 'Bank', account_number: '1234567890', current_balance: '1.25' }],
  });
  assert.equal(data.recent_transactions[0].reference, '••••3456');
  assert.equal(data.banks[0].account_number, undefined);
  assert.equal(data.kpis.bank_balance_thb, '1.25');
});

test('empty production tables produce honest zero state', () => {
  const data = buildOpsOverview({ now: '2026-10-06T01:00:00Z' });
  assert.deepEqual(data.kpis, { thb_in: '0', sent_usdt: '0', pending_usdt: '0', transactions: 0, pending_slips: 0, open_exceptions: 0, stale_slips: 0, bank_balance_thb: '0' });
  assert.equal(data.recent_transactions.length, 0);
  assert.equal(data.pending_slips.length, 0);
});
`;
writeFileSync(path.join(testsPath, 'ops-summary.test.mjs'), opsTests);

console.log('Patched CE VAULT root into a live read-only operational board backed by Supabase operational tables.');
