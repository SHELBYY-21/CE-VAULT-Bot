import './ops.css';

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

function accountRows(items) {
  if (!items.length) return empty('ยังไม่มี bank_accounts ในฐานข้อมูล');
  return '<div class="account-list">' + items.map(function (item) {
    return '<article class="account-card"><div><span class="eyebrow">' + esc(item.bank_name || 'BANK') + '</span><strong class="account-number">' + esc(item.account_number || 'ไม่มีเลขบัญชี') + '</strong><small>' + esc(item.label || 'ไม่มีชื่อกำกับ') + '</small></div><b>' + esc(decimalText(item.current_balance, 'THB')) + '</b></article>';
  }).join('') + '</div>';
}

function renderTriage(o) {
  const alerts = [];
  const k = o.kpis || {};
  if (Number(k.open_exceptions || 0) > 0) alerts.push({ label: 'Exceptions เปิด ' + k.open_exceptions + ' รายการ', tone: 'danger' });
  if (Number(k.stale_slips || 0) > 0) alerts.push({ label: 'สลิป stale ' + k.stale_slips + ' รายการ', tone: 'warning' });
  if (o.coverage && o.coverage.transactions_capped) alerts.push({ label: 'ยอดวันนี้อาจไม่ครบ (อ่านครบขีด ' + o.coverage.transactions_scanned + ')', tone: 'warning' });
  const pendingUpdates = state.telegram && state.telegram.webhook ? Number(state.telegram.webhook.pending_update_count ?? 0) : 0;
  if (pendingUpdates > 0) alerts.push({ label: 'Telegram ค้าง ' + pendingUpdates + ' update', tone: 'warning' });
  const apiOk = state.health && state.health.mode === 'SANDBOX' && state.health.database === 'CONFIGURED';
  if (!apiOk) alerts.push({ label: 'Runtime health ผิดปกติ', tone: 'danger' });
  if (!alerts.length) return '<section class="triage"><span class="triage-chip ok">ALL CLEAR — ไม่มีสิ่งที่ต้องจัดการทันที</span></section>';
  return '<section class="triage">' + alerts.map(function (a) {
    return '<span class="triage-chip ' + a.tone + '">' + esc(a.label) + '</span>';
  }).join('') + '</section>';
}

function exceptionRows(items) {
  if (!items.length) return empty('ไม่มี settlement exception สถานะ OPEN');
  return '<div class="rows">' + items.map(function (item) {
    const age = item.age_minutes == null ? '—' : (item.age_minutes >= 60 ? Math.floor(item.age_minutes / 60) + ' ชม. ' + (item.age_minutes % 60) + ' น.' : item.age_minutes + ' นาที');
    return '<article class="row"><div><strong>' + esc(item.exception_type || 'UNKNOWN') + '</strong><span>เปิดเมื่อ ' + esc(timeBangkok(item.created_at)) + '</span></div><div class="amount"><strong>' + esc(age) + '</strong><span>อายุค้าง</span></div><span class="pill danger">' + esc(item.status || 'OPEN') + '</span></article>';
  }).join('') + '</div>';
}

function trendChart(items) {
  if (!items.length) return empty('จะแสดงกราฟเมื่อมีรายการวันนี้');
  const maxThb = items.reduce(function (mx, b) { return Math.max(mx, Number(b.thb_in || 0)); }, 0);
  return '<div class="trend-wrap">' + items.map(function (b, index) {
    const pct = maxThb > 0 ? Math.max(3, Math.round((Number(b.thb_in || 0) / maxThb) * 100)) : 3;
    const active = Number(b.thb_in || 0) > 0 ? ' active' : '';
    const tip = b.hour_label + ' · เข้า ' + decimalText(b.thb_in, 'THB') + ' · ส่ง ' + decimalText(b.usdt_sent, 'USDT');
    const showLabel = index % 2 === 0 ? '' : ' hide-sm';
    return '<div class="trend-col" title="' + esc(tip) + '"><div class="trend-bar' + active + '" style="height:' + pct + '%"></div><small class="' + showLabel + '">' + esc(b.hour_label) + '</small></div>';
  }).join('') + '</div>';
}

function serviceRow(name, ok, detail) {
  return '<div class="service"><span class="dot ' + (ok ? 'ok' : 'warn') + '"></span><div><strong>' + esc(name) + '</strong><span>' + esc(detail) + '</span></div><b>' + (ok ? 'OK' : 'CHECK') + '</b></div>';
}

function workflowRail() {
  return '<section class="workflow-shell"><div class="workflow-heading"><div><span class="eyebrow">CE EMPIRE · WEB FLOW</span><h2>BANK SLIP → USDT</h2></div><span class="readonly">READ-ONLY VIEW</span></div><div class="workflow-rail">' +
    '<article class="flow-step cyan"><span class="flow-index">01</span><strong>OCR</strong><small>READ SLIP</small></article><span class="flow-arrow">›</span>' +
    '<article class="flow-step gold"><span class="flow-index">02</span><strong>MATCH</strong><small>VERIFY</small></article><span class="flow-arrow">›</span>' +
    '<article class="flow-step success"><span class="flow-index">03</span><strong>IN</strong><small>RECORD</small></article><span class="flow-arrow">›</span>' +
    '<article class="flow-step warning"><span class="flow-index">04</span><strong>WAIT</strong><small>USDT</small></article><span class="flow-arrow">›</span>' +
    '<article class="flow-step success"><span class="flow-index">05</span><strong>DONE</strong><small>COMPLETE</small></article>' +
    '</div></section>';
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
    renderTriage(o),
    '<section class="kpis">',
      kpi('ยอดรับวันนี้', decimalText(k.thb_in, 'THB'), String(k.transactions || 0) + ' รายการวันนี้', 'gold'),
      kpi('ส่ง USDT แล้ว', decimalText(k.sent_usdt, 'USDT'), 'จาก sent_usdt ที่บันทึกจริง', 'cyan'),
      kpi('รอส่ง USDT', decimalText(k.pending_usdt, 'USDT'), 'expected_usdt − sent_usdt เฉพาะค่าบวก', 'warning'),
      kpi('สลิปรอตรวจ', String(k.pending_slips || 0), 'อ่านจาก pending_slips', 'cyan'),
      kpi('Exceptions เปิด', String(k.open_exceptions || 0), 'blocking/review ที่ status OPEN', k.open_exceptions ? 'warning' : 'success'),
      kpi('ยอดบัญชีรวม', decimalText(k.bank_balance_thb, 'THB'), 'รวม current_balance · แสดงเลขบัญชีเต็มใน ACCOUNT DIRECTORY', 'gold'),
    '</section>',
    '<section class="context-grid">',
      '<article class="context"><span>Cycle</span><strong>' + esc(cycle ? 'CE' + cycle.cycle_number : 'ยังไม่มี OPEN cycle') + '</strong><small>' + esc(cycle ? cycle.status + ' · limit ' + decimalText(cycle.limit_thb, 'THB') : 'พร้อมเริ่มใหม่เมื่อมี cycle จริง') + '</small></article>',
      '<article class="context"><span>Desk / Sell Rate</span><strong>' + esc(rate ? decimalText(rate.sell_rate, 'THB') : '—') + '</strong><small>' + esc(rate ? 'อัปเดต ' + timeBangkok(rate.created_at) : 'ยังไม่มี rate') + '</small></article>',
      '<article class="context"><span>Market USDT Rate</span><strong>' + esc(rate ? decimalText(rate.market_usdt_rate, 'THB') : '—') + '</strong><small>แสดงค่าจาก rates โดยไม่คำนวณแทน</small></article>',
      '<article class="context"><span>Stale Slip</span><strong>' + esc(String(k.stale_slips || 0)) + '</strong><small>รายการวันนี้ที่ is_stale_slip=true</small></article>',
    '</section>',
    '<section class="panel account-directory"><div class="heading"><div><span class="eyebrow">ACCOUNT DIRECTORY</span><h2>บัญชีรับทั้งหมด</h2></div><b>' + esc(String((o.banks || []).length)) + '</b></div>' + accountRows(o.banks || []) + '</section>',
    '<section class="two-col">',
      '<article class="panel smart-inbox"><div class="heading"><div><span class="eyebrow">SMART INBOX</span><h2>งานที่ต้องจัดการ</h2></div><b>' + esc(String(k.pending_slips || 0)) + '</b></div>' + pendingRows(o.pending_slips || []) + '</article>',
      '<article class="panel"><div class="heading"><div><span class="eyebrow">RECENT</span><h2>ธุรกรรมล่าสุด</h2></div><b>' + esc(String((o.recent_transactions || []).length)) + '</b></div>' + transactionRows(o.recent_transactions || []) + '</article>',
    '</section>',
    '<section class="panel exceptions-panel"><div class="heading"><div><span class="eyebrow">EXCEPTIONS NOW</span><h2>งานผิดปกติที่ต้องปิด</h2></div><b>' + esc(String(k.open_exceptions || 0)) + '</b></div>' + exceptionRows(o.exceptions_detail || []) + '</section>',
    '<section class="panel"><div class="heading"><div><span class="eyebrow">CASHFLOW TREND</span><h2>เงินไหล 12 ชั่วโมงล่าสุด</h2></div><span class="readonly">BANGKOK TIME</span></div>' + trendChart(o.hourly_cashflow || []) + '<div class="trend-note">แท่งละ 1 ชั่วโมง · ความสูง = THB เข้า · พักเมาส์เพื่อดู USDT ส่ง · ข้อมูลจริงจาก transactions เท่านั้น</div></section>',
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
