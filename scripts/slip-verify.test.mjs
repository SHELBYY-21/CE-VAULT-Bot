import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeSlipQrPayload } from '../runtime-patches/slip-verify.mjs';
import {
  resolveSlipVerifyConfig,
  isSlipQrPayload,
  verifySlip,
  formatSlipVerifyReply,
} from '../runtime-patches/live-intake.mjs';

const QR = '00020101021130670016A000000677010111'.repeat(2);

test('credential auto-detection resolves slipok from any alias spelling', () => {
  const a = resolveSlipVerifyConfig({ SLIPOK_BRANCH_ID: 'B1', SLIPOK_API_KEY: 'K1' });
  assert.equal(a.provider, 'slipok');
  assert.equal(a.branchId, 'B1');
  assert.equal(a.apiKey, 'K1');
  const b = resolveSlipVerifyConfig({ SLIP_OK_BRANCH_ID: 'B2', SLIP_OK_API_KEY: 'K2' });
  assert.equal(b.branchId, 'B2');
  const c = resolveSlipVerifyConfig({ SLIPVERIFY_BRANCH_ID: 'B3', SLIPVERIFY_API_KEY: 'K3' });
  assert.equal(c.apiKey, 'K3');
  assert.equal(resolveSlipVerifyConfig({}), null);
});

test('scb credential set is detected honestly as pending', async () => {
  const cfg = resolveSlipVerifyConfig({ SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.equal(cfg.provider, 'scb');
  const verdict = await verifySlip(QR, { SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.equal(verdict.status, 'PROVIDER_PENDING');
});

test('qr payload gate accepts EMVCo digit strings and rejects the rest', () => {
  assert.ok(isSlipQrPayload(QR));
  assert.ok(!isSlipQrPayload('hello world this is not a qr'));
  assert.ok(!isSlipQrPayload('123'));
});

test('verifySlip honors the rollback switch and honest statuses', async () => {
  const disabled = await verifySlip(QR, { CE_SLIP_VERIFY: '0', SLIPOK_BRANCH_ID: 'B', SLIPOK_API_KEY: 'K' });
  assert.equal(disabled.status, 'DISABLED');
  const missing = await verifySlip(QR, {});
  assert.equal(missing.status, 'NOT_CONFIGURED');
  const badPayload = await verifySlip('nope', { SLIPOK_BRANCH_ID: 'B', SLIPOK_API_KEY: 'K' });
  assert.equal(badPayload.status, 'INVALID_PAYLOAD');
  const scb = await verifySlip(QR, { SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.equal(scb.status, 'PROVIDER_PENDING');
});

test('verifySlip calls slipok exactly as the upstream SDK does', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ data: { success: true, amount: 500, receiverName: 'มาลัย ภู่ชาดา', transRef: 'R1' } }) };
  };
  const result = await verifySlip(QR, { SLIPOK_BRANCH_ID: 'BR', SLIPOK_API_KEY: 'SECRET' }, fake);
  assert.equal(result.status, 'VALID');
  assert.equal(result.amount, 500);
  assert.match(calls[0].url, /api\.slipok\.com\/api\/line\/apikey\/BR$/);
  assert.equal(calls[0].opts.headers['x-authorization'], 'SECRET');
  assert.equal(JSON.parse(calls[0].opts.body).data, QR);
});

test('invalid slip and provider errors stay honest without leaking secrets', async () => {
  const invalid = await verifySlip(QR, { SLIPOK_BRANCH_ID: 'B', SLIPOK_API_KEY: 'SECRETK' }, async () => ({ ok: true, json: async () => ({ data: { success: false } }) }));
  assert.equal(invalid.status, 'INVALID');
  const error = await verifySlip(QR, { SLIPOK_BRANCH_ID: 'B', SLIPOK_API_KEY: 'SECRETK' }, async () => { throw new Error('boom'); });
  assert.equal(error.status, 'ERROR');
  assert.ok(!JSON.stringify(error).includes('SECRETK'));
  const http = await verifySlip(QR, { SLIPOK_BRANCH_ID: 'B', SLIPOK_API_KEY: 'SECRETK' }, async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.equal(http.reason, 'PROVIDER_HTTP_500');
});

test('cards are honest per status and never echo credentials', () => {
  const valid = formatSlipVerifyReply({ status: 'VALID', amount: 500, receiver: 'X', ref: 'R' });
  assert.match(valid, /VERIFIED/);
  assert.match(valid, /TRACE ▸ QR → SLIPOK/);
  assert.match(formatSlipVerifyReply({ status: 'NOT_CONFIGURED' }), /SLIPOK_BRANCH_ID/);
  assert.match(formatSlipVerifyReply({ status: 'PROVIDER_PENDING', provider: 'scb' }), /scb/);
  assert.match(formatSlipVerifyReply({ status: 'DISABLED' }), /CE_SLIP_VERIFY=0/);
  for (const card of [valid, formatSlipVerifyReply({ status: 'INVALID' })]) {
    assert.ok(!card.includes('SECRET'));
  }
});

test('handler and router wiring pinned at real anchors', () => {
  const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  assert.ok(helpers.includes('async function handleSlipVerifyMessage(message) {'));
  assert.ok(helpers.includes('await verifySlip(payload);'));
  assert.ok(helpers.includes('formatSlipVerifyReply(result)'));
  const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  assert.ok(patch.includes('isSlipQrPayload(message.text)'));
  assert.ok(patch.includes('await handleSlipVerifyMessage(message);'));
  const importList = patch.slice(patch.indexOf('import { accountLast4'), patch.indexOf('} from "./live-intake.mjs"'));
  for (const name of ['formatSlipVerifyReply', 'isSlipQrPayload', 'verifySlip']) {
    assert.ok(importList.includes(name), 'missing from production imports: ' + name);
  }
});


test('slip photo QR decodes end-to-end with vendored jsQR + jpeg-js', () => {
  const fixture = readFileSync(new URL('./fixtures/slip-qr.jpg', import.meta.url));
  assert.equal(decodeSlipQrPayload(fixture), '00020101021129370016A0000006770101110212312345');
  assert.equal(decodeSlipQrPayload(Buffer.from('not an image at all')), null);
  assert.equal(decodeSlipQrPayload(null), null);
});

test('photo-flow verify card copy fits the recorded-slip context', () => {
  const card = formatSlipVerifyReply({ status: 'VALID', amount: 500 }, 'photo');
  assert.ok(card.includes('ยืนยันที่การ์ดสลิปด้านบน'));
  const bad = formatSlipVerifyReply({ status: 'INVALID' }, 'photo');
  assert.ok(bad.includes('ตรวจสลิปต้นฉบับก่อนกดยืนยัน'));
  assert.ok(!bad.includes('SECRET'));
});

test('photo flow wiring and vendor install pinned at real anchors', () => {
  const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  assert.ok(helpers.includes('typeof decodeSlipQrPayload === ' + String.fromCharCode(34) + 'function' + String.fromCharCode(34)));
  assert.ok(helpers.includes('decodeSlipQrPayload(downloaded.buffer)'));
  assert.ok(helpers.includes('verifySlip(slipQrPayload)'));
  assert.ok(helpers.includes('formatSlipVerifyReply(verifyResult, ' + String.fromCharCode(34) + 'photo' + String.fromCharCode(34) + ')'));
  const patch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
  assert.ok(patch.includes("copyTree(path.join(root, 'runtime-patches', 'vendor'"));
  assert.ok(patch.includes('SLIP_VERIFY_SERVER_IMPORT_ANCHOR_NOT_FOUND'));
  assert.ok(patch.includes('decodeSlipQrPayload'));
});
