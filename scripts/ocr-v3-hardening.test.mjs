import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = await import('../runtime-patches/live-intake.mjs');
const source = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');

test('vision JSON keeps null numeric fields null instead of coercing them to zero', () => {
  assert.equal(typeof runtime.parseVisionJson, 'function');
  const parsed = runtime.parseVisionJson(JSON.stringify({
    thbAmount: null,
    time: null,
    date: null,
    receiverLast4: null,
    bank: null,
    receiverName: null,
    senderName: null,
    confidence: null,
  }));
  assert.equal(parsed.thbAmount, null);
  assert.equal(parsed.confidence, null);
});

test('vision JSON accepts real numeric strings but rejects empty values', () => {
  const parsed = runtime.parseVisionJson(JSON.stringify({
    thbAmount: '1250.50',
    time: '12:34',
    date: '08/10/26',
    receiverLast4: '1234',
    bank: 'KBANK',
    receiverName: 'TEST USER',
    senderName: 'SENDER',
    confidence: '98',
  }));
  assert.equal(parsed.thbAmount, 1250.5);
  assert.equal(parsed.confidence, 98);

  const empty = runtime.parseVisionJson(JSON.stringify({
    thbAmount: '',
    confidence: '',
  }));
  assert.equal(empty.thbAmount, null);
  assert.equal(empty.confidence, null);
});

test('rich OCR error card never renders fake 0 percent when confidence is missing', () => {
  const rich = runtime.formatIntakeRichMessage({
    pending: {
      ledger_ref: 'CE-20261008-ABCDEF7D0E',
      status: 'OCR_FAILED',
      thb_in: null,
      should_send: null,
      bank: null,
      account_masked: null,
      name: null,
      pin_match: false,
      ocr_confidence: null,
    },
    deskRate: { sell_rate: '37.12' },
  });
  assert.doesNotMatch(rich.html, /OCR confidence\s*·\s*0%/i);
  assert.match(rich.html, /TX-\d{4}/);
});

test('OCR prompt explicitly covers Thai transfer, bill-payment, QR and biller receipts', () => {
  assert.match(source, /bill(?:er|[- ]payment)/i);
  assert.match(source, /QR/i);
  assert.match(source, /transaction amount/i);
  assert.match(source, /do not invent/i);
});

test('OCR failures emit bounded provider diagnostics without image or account data', () => {
  assert.match(source, /\[CE OCR\]/);
  assert.match(source, /response\.status/);
  assert.doesNotMatch(source, /console\.(?:warn|error)\([^\n]*(?:buffer\.toString|base64Image|receiverName|account_number)/i);
});
