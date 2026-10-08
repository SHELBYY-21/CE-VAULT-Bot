import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as intake from '../runtime-patches/live-intake.mjs';

// Real Render intake helper code and real OCR parsing/decision logic.
// External boundaries (Telegram API, Typhoon HTTP, Supabase repository and market)
// are simulated and NEVER connect to a production account, bot or database.
const renderHelpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7cH4AAAAASUVORK5CYII=', 'base64');
const today = intake.bangkokDateKey();
const dayAsSlip = [today.slice(8), today.slice(5, 7), today.slice(0, 4)].join('/');
const fixture = (date = dayAsSlip, account = '4321') => [
  'SCB',
  'โอนเงินสำเร็จ',
  date + ' 12:45',
  'ไปยัง',
  'นางสาว ทดลอง ระบบ',
  'xxx-xxx-' + account,
  'จำนวนเงิน',
  '1,234.50 บาท',
].join('\n');
const defaults = {
  operator: true,
  ocrText: fixture(),
  pins: [{ id: 'pin-sandbox-1', bank_name: 'SCB', account_number: '1234564321', label: 'TEST' }],
  market: { symbol: 'USDTTHB', price: '33.40', fresh: true },
  rate: { sell_rate: '33.50' },
  promotionError: null,
};

// Each scenario has a fresh in-memory repository and a fake Telegram client.
// It exercises the original handleLiveSlipMessage code, not a reimplementation.
function prepareScenario(overrides = {}) {
  const options = { ...defaults, ...overrides };
  const pendingRows = [];
  const sent = [];
  const events = [];
  const audit = { ocrCalls: 0, apiCalls: [], create: 0, promote: 0, outbound: 0 };
  const repository = {
    async getOperatorByTelegramId(id) {
      return options.operator && id === 7711 ? { id: 'operator-sandbox', name: 'TEST OPERATOR' } : null;
    },
    async findIntakeDuplicate(fp) {
      const existing = pendingRows.find(x => x.slip_fingerprint === fp);
      return existing ? { source: 'pending_slips', ...existing } : null;
    },
    async getLatestDeskRate() { return options.rate; },
    async listPinnedBanksForDate() { return options.pins; },
    async createPendingSlip(row) {
      audit.create++;
      const stored = { ...row, id: 'pending-' + (pendingRows.length + 1), duplicate: false };
      pendingRows.push(stored);
      return stored;
    },
    async promotePendingSlip(id) {
      audit.promote++;
      if (options.promotionError) throw new Error(options.promotionError);
      const existing = pendingRows.find(x => x.id === id);
      if (!existing) throw new Error('NO_PENDING_ROW');
      existing.status = 'RECORDED';
      existing.tx_id = 'fake-transaction-' + audit.promote;
      return { tx_id: existing.tx_id };
    },
    async updatePendingSlip(id, patch) {
      const existing = pendingRows.find(x => x.id === id);
      Object.assign(existing, patch);
      return existing;
    },
  };
  const telegram = {
    async sendRichMessageWithFallback(chatId, rich, fallback) {
      const m = { kind: 'send', chatId, rich, fallback, message_id: 600 };
      sent.push(m);
      return m;
    },
    async editRichMessageWithFallback(chatId, id, rich, fallback) {
      const m = { kind: 'edit', chatId, message_id: id, rich, fallback };
      sent.push(m);
      return m;
    },
    async sendMessage(chatId, text) { sent.push({ kind: 'text', chatId, text }); },
    async downloadFile(id) {
      assert.equal(id, 'synthetic-image');
      return { buffer: image, mimeType: 'image/png', filePath: 'synthetic.png' };
    },
  };
  const bindings = {
    repository, telegram, Buffer, console, setTimeout, clearTimeout,
    process: { env: { CE_RESPONSE_V4: '1' } },
    ...intake,
    formatScanStageRichMessage: () => ({ html: 'SCANNING' }),
    formatScanStageReply: () => 'SCANNING',
    formatIntakeRichMessage: () => ({ html: 'legacy' }),
    formatIntakeReply: () => 'legacy',
    publishSse: (type, value) => events.push({ type, value }),
    fetchBinanceThSpot: async () => options.market,
  };
  const run = vm.runInNewContext(renderHelpers + '\n({handleLiveSlipMessage})', bindings, { timeout: 1000 });
  const message = {
    message_id: 200, from: { id: 7711 },
    chat: { id: -1007701, title: 'TEST ONLY' },
    photo: [{ file_id: 'synthetic-image', width: 800, height: 600 }],
  };
  return { options, pendingRows, audit, sent, events, message, run };
}

test('REALISTIC SANDBOX: telegram slip -> mocked Typhoon response -> match -> pending admin approval', async (t) => {
  const keys = [
    'TYPHOON_OCR_API_KEY', 'TYPHOON_OCR_BASE_URL', 'PADDLEOCR_LLAMA_ENABLED',
    'PADDLEOCR_LLAMA_URL', 'PADDLEOCR_VL_URL', 'PADDLEOCR_BASE_URL',
    'GROK_API_KEY', 'XAI_API_KEY', 'OCR_SPACE_API_KEY'
  ];
  const original = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of keys) delete process.env[key];
    process.env.TYPHOON_OCR_API_KEY = 'LOCAL_SYNTHETIC_TEST_ONLY';
    process.env.TYPHOON_OCR_BASE_URL = 'https://typhoon.invalid/v1';
    let context = null;
    globalThis.fetch = async (url, opts) => {
      assert.match(url, /^https:\/\/typhoon\.invalid\/v1\/chat\/completions$/);
      const data = JSON.parse(opts.body);
      assert.match(data.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
      assert.equal(data.model, 'typhoon-ocr');
      context.audit.ocrCalls++;
      context.audit.apiCalls.push(url);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ natural_text: context.options.ocrText }) } }] }) };
    };

    await t.test('valid SCB synthetic slip awaits human approval, never auto records', async () => {
      context = prepareScenario();
      await context.run.handleLiveSlipMessage(context.message);
      assert.equal(context.audit.ocrCalls, 1);
      assert.equal(context.audit.create, 1);
      assert.equal(context.audit.promote, 0);
      assert.equal(context.pendingRows[0].status, 'VERIFIED');
      assert.equal(context.pendingRows[0].thb_in, '1234.5');
      assert.equal(context.pendingRows[0].should_send, intake.divideDecimal('1234.5', '33.5', 6));
      assert.equal(context.pendingRows[0].pin_match, true);
      assert.equal(context.pendingRows[0].bank_account_id, 'pin-sandbox-1');
      assert.equal(context.pendingRows[0].source_file_id, 'synthetic-image');
      assert.match(context.sent.at(-1).fallback, /Pending Admin Approval/);
      assert.match(context.sent.at(-1).fallback, /WAIT/);
      assert.doesNotMatch(context.sent.at(-1).fallback, /ALL CHECKS PASS/);
      assert.equal(context.events.length, 0);
      assert.equal(context.sent[0].kind, 'send');
      assert.equal(context.sent.at(-1).kind, 'edit');
    });

    await t.test('duplicate replay does not call Typhoon or create a second ledger record', async () => {
      context = prepareScenario();
      await context.run.handleLiveSlipMessage(context.message);
      const firstOcr = context.audit.ocrCalls;
      await context.run.handleLiveSlipMessage({ ...context.message, message_id: 201 });
      assert.equal(context.audit.ocrCalls, firstOcr);
      assert.equal(context.audit.create, 1);
      assert.equal(context.audit.promote, 0);
      assert.equal(context.pendingRows.length, 1);
      assert.match(context.sent.at(-1).fallback, /ห้ามบันทึกซ้ำ/);
    });

    const negative = [
      ['wrong receiver account', { ocrText: fixture(dayAsSlip, '9999') }, 'BANK_MISMATCH'],
      ['stale dated slip', { ocrText: fixture('07/10/2025') }, 'STALE_SLIP'],
      ['low confidence OCR', { ocrText: 'SCB\nจำนวนเงิน 1,234.50 บาท' }, 'NEEDS_REVIEW'],
      ['missing amount', { ocrText: 'ไม่สามารถอ่านข้อความจากภาพได้' }, 'OCR_FAILED'],
      ['no pinned bank', { pins: [] }, 'PIN_REQUIRED'],
      ['no desk rate', { rate: null }, 'RATE_REQUIRED'],
      ['stale market quote', { market: { fresh: false, price: '33.40' } }, 'MARKET_UNAVAILABLE'],
    ];
    for (const [name, options, status] of negative) {
      await t.test(name + ' -> ' + status + ', no promotion', async () => {
        context = prepareScenario(options);
        await context.run.handleLiveSlipMessage(context.message);
        assert.equal(context.audit.create, 1);
        assert.equal(context.audit.promote, 0);
        assert.equal(context.pendingRows[0].status, status);
        assert.equal(context.events.length, 0);
        assert.doesNotMatch(context.sent.at(-1).fallback || '', /ALL CHECKS PASS/);
      });
    }

    await t.test('promotion failure cannot occur before an admin approves', async () => {
      context = prepareScenario({ promotionError: 'SIMULATED_RPC_FAILURE' });
      await context.run.handleLiveSlipMessage(context.message);
      assert.equal(context.pendingRows[0].status, 'VERIFIED');
      assert.equal(context.audit.promote, 0);
      assert.equal(context.events.length, 0);
      assert.doesNotMatch(context.sent.at(-1).fallback, /ALL CHECKS PASS/);
    });

    await t.test('unknown Telegram user cannot download a slip or write a ledger record', async () => {
      context = prepareScenario({ operator: false });
      await context.run.handleLiveSlipMessage(context.message);
      assert.equal(context.audit.ocrCalls, 0);
      assert.equal(context.audit.create, 0);
      assert.equal(context.audit.promote, 0);
      assert.equal(context.pendingRows.length, 0);
      assert.match(context.sent.at(-1).text, /ACCESS DENIED/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
