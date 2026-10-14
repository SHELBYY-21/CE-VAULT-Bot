// CE VAULT - 1000-round realistic simulation harness.
// Exercises the live API/credential auto-management layer end to end with seeded randomized scenarios.
import {
  resolveSlipVerifyConfig,
  isSlipQrPayload,
  verifySlip,
  formatSlipVerifyReply,
  formatBotCeBriefReply,
  botHomeReplyMarkup,
  ceBriefReplyMarkup,
} from '../runtime-patches/live-intake.mjs';

let seed = 20261014;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

const QR_VALID = '00020101021130670016A000000677010111' + '0212345678901234567890'.repeat(8);
const QR_SHORT = '00020101021130670016';
const THAI_TEXT = 'สวัสดีครับ โอนเงิน 5000 บาทแล้วนะครับ';
const GARBAGE = 'hello world not a qr at all';

const ENV_STATES = [
  {},
  { SCB_APPLICATION_KEY: 'ak', SCB_APPLICATION_SECRET: 'SECRET-SCB-7788' },
  { SLIPVERIFY_SCB_KEY: 'vk', SLIPVERIFY_SCB_SECRET: 'SECRET-SCB-9900' },
  { SCB_API_KEY: 'sk', SCB_API_SECRET: 'SECRET-SCB-5566' },
  { CE_SLIP_VERIFY: '0', SCB_API_KEY: 'sk', SCB_API_SECRET: 'SECRET-SCB-5566' },
];
const PAYLOADS = [QR_VALID, QR_VALID, QR_SHORT, THAI_TEXT, GARBAGE, '', '   ' + QR_VALID.trim() + '   ', QR_VALID.slice(0, 511), QR_VALID + 'x'];

const stats = { rounds: 0, exceptions: 0, secretLeaks: 0, dishonest: 0, statuses: {}, gate: { accept: 0, reject: 0 }, timings: [], slowest: [] };
const errors = [];

function record(status) { stats.statuses[status] = (stats.statuses[status] || 0) + 1; }

for (let i = 0; i < 1000; i++) {
  const env = pick(ENV_STATES);
  const payload = pick(PAYLOADS);
  const t0 = process.hrtime.bigint();
  try {
    const verdict = await verifySlip(payload, env);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    stats.timings.push(ms);
    if (ms > 50) stats.slowest.push({ round: i, ms: Number(ms.toFixed(2)) });
    record(verdict.status);
    const card = formatSlipVerifyReply(verdict);
    if (card.includes('SECRET-SCB-5566') || card.includes('SECRET-SCB-7788') || card.includes('SECRET-SCB-9900')) { stats.secretLeaks++; errors.push('SECRET_LEAK round ' + i); }
    const cfg = resolveSlipVerifyConfig(env);
    let expected;
    if (env.CE_SLIP_VERIFY === '0') expected = 'DISABLED';
    else if (!cfg) expected = 'NOT_CONFIGURED';
    else if (!isSlipQrPayload(payload)) expected = 'INVALID_PAYLOAD';
    else expected = 'PROVIDER_PENDING';
    if (verdict.status !== expected) {
      stats.dishonest++; errors.push('DISHONEST round ' + i + ' status=' + verdict.status + ' expected=' + expected);
    }
    if (isSlipQrPayload(payload)) stats.gate.accept++; else stats.gate.reject++;
  } catch (err) {
    stats.exceptions++; errors.push('EXCEPTION round ' + i + ': ' + String(err && err.message));
  }
}

// brain rounds on top: every env state x data shapes
const KPI_SHAPES = [
  { kpis: {}, rate: null },
  { kpis: { thb_in: '12000', sent_usdt: '300.5', pending_usdt: '42.1', transactions: 3, pending_slips: 2, open_exceptions: 1 }, rate: { sell_rate: '35.2' } },
  { kpis: { open_exceptions: 4, pending_slips: 5 }, rate: null },
  null,
];
for (let i = 0; i < 200; i++) {
  const env = pick(ENV_STATES);
  const shape = pick(KPI_SHAPES);
  try {
    const brief = formatBotCeBriefReply(shape, env);
    if (brief.includes('SECRET-')) { stats.secretLeaks++; errors.push('BRIEF_SECRET_LEAK round ' + i); }
    if (!brief.includes('NEXT')) { stats.dishonest++; errors.push('BRIEF_NO_NEXT round ' + i); }
    if (shape === null && !brief.includes('ยังไม่สามารถอ่านข้อมูลจริง')) { stats.dishonest++; errors.push('BRIEF_FAKE_OK_ON_DB_DOWN round ' + i); }
  } catch (err) {
    stats.exceptions++; errors.push('BRIEF_EXCEPTION round ' + i + ': ' + String(err && err.message));
  }
}

// keyboard integrity every round
for (let i = 0; i < 100; i++) {
  const home = botHomeReplyMarkup().inline_keyboard.flat().map((b) => b.callback_data);
  const board = ceBriefReplyMarkup().inline_keyboard.flat().map((b) => b.callback_data);
  if (home.length !== 7 || board.length !== 6) { stats.exceptions++; errors.push('KEYBOARD round ' + i); }
}

const times = stats.timings.sort((a, b) => a - b);
const p = (q) => times.length ? Number(times[Math.floor(times.length * q)]).toFixed(3) : 'n/a';
const FAILED = stats.exceptions > 0 || stats.secretLeaks > 0 || stats.dishonest > 0;
if (FAILED) process.exitCode = 1;
console.log(FAILED ? 'SIM_1000 FAIL' : 'SIM_1000 PASS');
console.log(JSON.stringify({
  rounds: 1000 + 200 + 100,
  exceptions: stats.exceptions,
  secretLeaks: stats.secretLeaks,
  dishonest: stats.dishonest,
  statuses: stats.statuses,
  gate: stats.gate,
  latency_ms: { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: times.length ? Number(times[times.length - 1]).toFixed(3) : 'n/a' },
  slowest: stats.slowest.slice(0, 5),
  errors: errors.slice(0, 10),
}, null, 2));
