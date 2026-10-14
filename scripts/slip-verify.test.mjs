import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveSlipVerifyConfig,
  isSlipQrPayload,
  verifySlip,
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
