import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveSlipVerifyConfig,
  isSlipQrPayload,
  verifySlip,
  verifySlipAi,
  crc16Emv,
  formatSlipVerifyReply,
} from '../runtime-patches/live-intake.mjs';

const QR = '00020101021130670016A000000677010111'.repeat(2);

test('slipok is fully removed: old env vars resolve to null and the source is clean', () => {
  assert.equal(resolveSlipVerifyConfig({ SLIPOK_BRANCH_ID: 'B1', SLIPOK_API_KEY: 'K1' }), null);
  assert.equal(resolveSlipVerifyConfig({ SLIP_OK_BRANCH_ID: 'B2', SLIP_OK_API_KEY: 'K2' }), null);
  assert.equal(resolveSlipVerifyConfig({ SLIPVERIFY_BRANCH_ID: 'B3', SLIPVERIFY_API_KEY: 'K3' }), null);
  const source = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
  assert.ok(!source.toLowerCase().includes('slipok'), 'slipok must not exist in the verify layer');
});

test('scb credential set is detected from every alias spelling', () => {
  const a = resolveSlipVerifyConfig({ SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.equal(a.provider, 'scb');
  const b = resolveSlipVerifyConfig({ SCB_APPLICATION_KEY: 'k', SCB_APPLICATION_SECRET: 's' });
  assert.equal(b.provider, 'scb');
  const c = resolveSlipVerifyConfig({ SLIPVERIFY_SCB_KEY: 'k', SLIPVERIFY_SCB_SECRET: 's' });
  assert.equal(c.provider, 'scb');
  assert.equal(resolveSlipVerifyConfig({ SCB_API_KEY: 'k' }), null);
  assert.equal(resolveSlipVerifyConfig({}), null);
});

test('scb integration stays honest as PROVIDER_PENDING with no network call', async () => {
  const calls = [];
  const verdict = await verifySlip(QR, { SCB_API_KEY: 'k', SCB_API_SECRET: 's' }, async (url) => { calls.push(url); return { ok: true, json: async () => ({}) }; });
  assert.equal(verdict.status, 'PROVIDER_PENDING');
  assert.equal(verdict.provider, 'scb');
  assert.equal(calls.length, 0);
});

test('qr payload gate accepts EMVCo digit strings and rejects the rest', () => {
  assert.ok(isSlipQrPayload(QR));
  assert.ok(!isSlipQrPayload('hello world this is not a qr'));
  assert.ok(!isSlipQrPayload('123'));
});

test('verifySlip honors the rollback switch and honest statuses', async () => {
  const disabled = await verifySlip(QR, { CE_SLIP_VERIFY: '0', SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.equal(disabled.status, 'DISABLED');
  const missing = await verifySlip(QR, {});
  assert.equal(missing.status, 'NOT_CONFIGURED');
  const badPayload = await verifySlip('nope', { SCB_API_KEY: 'k', SCB_API_SECRET: 's' });
  assert.equal(badPayload.status, 'INVALID_PAYLOAD');
});

test('cards are honest per status and never mention slipok or credentials', () => {
  const valid = formatSlipVerifyReply({ status: 'VALID', amount: 500, receiver: 'X', ref: 'R' });
  assert.match(valid, /VERIFIED/);
  assert.match(valid, /TRACE ▸ QR → VERIFY/);
  const notConfigured = formatSlipVerifyReply({ status: 'NOT_CONFIGURED' });
  assert.match(notConfigured, /SCB_API_KEY/);
  assert.ok(!notConfigured.toLowerCase().includes('slipok'));
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

function buildEmvPayload() {
  const base = '00020101021130670016A000000677010111'.repeat(2) + '5303764' + '5802TH' + '6304';
  const crc = crc16Emv(base).toString(16).toUpperCase().padStart(4, '0');
  return base + crc;
}

test('ai-ocr verify provider auto-selects when only Typhoon is configured', () => {
  const config = resolveSlipVerifyConfig({ TYPHOON_OCR_API_KEY: 'k' });
  assert.equal(config.provider, 'ai-ocr');
  assert.equal(config.ai.typhoon, true);
  assert.equal(config.ai.xai, false);
  const forced = resolveSlipVerifyConfig({ SLIPVERIFY_PROVIDER: 'AI-OCR' });
  assert.equal(forced.provider, 'ai-ocr');
});

test('scb keeps priority over ai-ocr when both are configured', () => {
  const config = resolveSlipVerifyConfig({ SCB_API_KEY: 'k', SCB_API_SECRET: 's', TYPHOON_OCR_API_KEY: 'k' });
  assert.equal(config.provider, 'scb');
});

test('ai-ocr verify passes honestly when CRC is valid and OCR amount matches the recorded amount', async () => {
  const payload = buildEmvPayload();
  const env = { TYPHOON_OCR_API_KEY: 'k' };
  const verdict = await verifySlipAi(payload, { thbAmount: 1500, bank: 'SCB', provider: 'TYPHOON_OCR_1_5' }, '1500', env);
  assert.equal(verdict.status, 'AI_VERIFIED');
  assert.equal(verdict.provider, 'ai-ocr');
  assert.equal(verdict.crc_ok, true);
  assert.equal(verdict.amount_match, 'MATCH');
  assert.equal(verdict.amount, 1500);
  const reply = formatSlipVerifyReply(verdict, 'photo');
  assert.match(reply, /AI CHECK ผ่าน/);
  assert.match(reply, /ไม่ใช่การยืนยันจากธนาคาร/);
  assert.doesNotMatch(reply, /VERIFIED — ตรวจกับ API จริง/);
});

test('ai-ocr verify reports mismatch when OCR amount differs from the recorded amount', async () => {
  const payload = buildEmvPayload();
  const verdict = await verifySlipAi(payload, { thbAmount: 1500, bank: 'SCB', provider: 'TYPHOON_OCR_1_5' }, '2000', { TYPHOON_OCR_API_KEY: 'k' });
  assert.equal(verdict.status, 'AI_MISMATCH');
  assert.equal(verdict.amount_match, 'MISMATCH');
  const reply = formatSlipVerifyReply(verdict);
  assert.match(reply, /AI CHECK ไม่ผ่าน/);
  assert.match(reply, /ไม่ตรงกับยอดที่บันทึก/);
});

test('ai-ocr verify rejects a tampered QR whose CRC signature is wrong', async () => {
  const payload = buildEmvPayload().slice(0, -1) + '0';
  const verdict = await verifySlipAi(payload, { thbAmount: 1500, bank: 'SCB', provider: 'TYPHOON_OCR_1_5' }, '1500', { TYPHOON_OCR_API_KEY: 'k' });
  assert.equal(verdict.status, 'AI_REJECTED');
  assert.equal(verdict.crc_ok, false);
  const reply = formatSlipVerifyReply(verdict);
  assert.match(reply, /CRC ของ QR ไม่ถูกต้อง/);
});

test('ai-ocr verify stays partial-honest when no OCR extraction is available (text QR only)', async () => {
  const payload = buildEmvPayload();
  const verdict = await verifySlipAi(payload, null, null, { TYPHOON_OCR_API_KEY: 'k' });
  assert.equal(verdict.status, 'AI_PARTIAL');
  assert.equal(verdict.crc_ok, true);
  const reply = formatSlipVerifyReply(verdict);
  assert.match(reply, /AI CHECK บางส่วน/);
});

test('ai-ocr verify honors rollback switches and stays silent when unconfigured', async () => {
  const payload = buildEmvPayload();
  assert.equal((await verifySlipAi(payload, null, null, { CE_SLIP_VERIFY: '0', TYPHOON_OCR_API_KEY: 'k' })).status, 'DISABLED');
  const aiOff = await verifySlipAi(payload, { thbAmount: 1500 }, '1500', { CE_SLIP_VERIFY_AI: '0', TYPHOON_OCR_API_KEY: 'k' });
  assert.equal(aiOff.status, 'AI_DISABLED');
  assert.match(formatSlipVerifyReply(aiOff), /CE_SLIP_VERIFY_AI=0/);
  assert.equal((await verifySlipAi(payload, null, null, {})).status, 'NOT_CONFIGURED');
});
