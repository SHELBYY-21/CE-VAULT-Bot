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


test('vision JSON rejects non-numeric JSON types instead of coercing them to zero', () => {
  for (const bad of [false, true, [], {}, ['12.3']]) {
    const parsed = runtime.parseVisionJson(JSON.stringify({
      thbAmount: bad,
      confidence: bad,
    }));
    assert.equal(parsed.thbAmount, null);
    assert.equal(parsed.confidence, null);
  }
});

const { findPinnedMatch, formatIntakeV4Reply, parseThaiSlipText, parseVisionJson } = runtime;

const pins = [{ id: 'scb', bank_name: 'SCB', account_number: '1234564321' }];

test('vision OCR preserves supplied banks that cannot be normalized', () => {
  for (const bank of ['OTHER', 'UNKNOWN BANK', 'SCB' + 'X'.repeat(65)]) {
    const slip = parseVisionJson(JSON.stringify({ bank, receiverLast4: '4321' }));
    assert.equal(slip.bank, null);
    assert.equal(slip.bankSupplied, true);
    assert.equal(findPinnedMatch(slip, pins), null);
  }
  for (const bank of [undefined, null, '', '   ']) {
    const slip = parseVisionJson(JSON.stringify({ bank, receiverLast4: '4321' }));
    assert.equal(slip.bankSupplied, false);
    assert.equal(findPinnedMatch(slip, pins), pins[0]);
  }
});

test('text OCR preserves nonempty bank input before normalization discards it', () => {
  for (const text of ['UNKNOWN BANK\nxxx-xxx-4321', 'SCB\n' + 'X'.repeat(65) + '\nxxx-xxx-4321']) {
    const slip = parseThaiSlipText(text);
    assert.equal(slip.bank, null);
    assert.equal(slip.receiverLast4, '4321');
    assert.equal(slip.bankSupplied, true);
    assert.equal(findPinnedMatch(slip, pins), null);
  }
  for (const text of ['', '   ']) assert.equal(parseThaiSlipText(text).bankSupplied, false);
  const slip = parseThaiSlipText('SCB\nxxx-xxx-4321');
  assert.equal(slip.bankSupplied, true);
  assert.equal(findPinnedMatch(slip, pins), pins[0]);
});

test('pinned matching checks bank presence independently of the normalized bank', () => {
  assert.equal(findPinnedMatch({ receiverLast4: '4321', bank: null, bankSupplied: true }, pins), null);
  assert.equal(findPinnedMatch({ receiverLast4: '4321', bank: null }, pins), pins[0]);
  assert.equal(findPinnedMatch({ receiverLast4: '4321', bank: 'SCB', bankSupplied: true }, pins), pins[0]);
  assert.equal(findPinnedMatch({ receiverLast4: '4321', bank: 'KBANK', bankSupplied: true }, pins), null);
  assert.equal(findPinnedMatch({ receiverLast4: '4321' }, [...pins, { ...pins[0], id: 'other' }]), null);
});

test('compact bank display rejects CR/LF while accepting aliases with r, n or backslashes', () => {
  const card = bank => formatIntakeV4Reply({ pending: { status: 'NEEDS_REVIEW', bank } });
  for (const bank of ['S\rCB', 'S\nCB', 'S\r\nCB']) {
    assert.match(card(bank), /🏦 บัญชีรับ: ไม่ยืนยัน/);
  }
  for (const [bank, code] of [['Kasikorn', 'KBANK'], ['Krungthai', 'KTB'], ['S\\CB', 'SCB']]) {
    assert.match(card(bank), new RegExp(`🏦 บัญชีรับ: ${code}`));
  }
  for (const bank of ['SCB' + 'X'.repeat(65), 'SCB จำนวนเงิน', 'UNKNOWN BANK']) {
    assert.match(card(bank), /🏦 บัญชีรับ: ไม่ยืนยัน/);
  }
});
