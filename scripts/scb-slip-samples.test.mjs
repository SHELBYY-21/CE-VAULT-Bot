import test from 'node:test';
import assert from 'node:assert/strict';

const runtime = await import('../runtime-patches/live-intake.mjs');

test('SCB transfer: Buddhist date, receiver block and split masked account', () => {
  const parsed = runtime.parseThaiSlipText([
    'SCB',
    'โอนเงินเข้าบัญชีสำเร็จ',
    '07 ต.ค. 2569 - 12:55',
    'จาก',
    'SAMPLE SENDER',
    '4830 99xx xxxx 3114',
    'ไปยัง',
    'นางสาว ตัวอย่าง ผู้รับ',
    'xxx-xxx562-9',
    'จำนวนเงิน',
    '1,000.00',
  ].join('\n'), 'SCB_FIXTURE');

  assert.equal(parsed.thbAmount, 1000);
  assert.equal(parsed.date, '07/10/2569');
  assert.equal(runtime.normalizeSlipDate(parsed.date), '2026-10-07');
  assert.equal(parsed.time, '12:55');
  assert.equal(parsed.bank, 'SCB');
  assert.equal(parsed.receiverLast4, '5629');
  assert.equal(parsed.receiverName, 'นางสาว ตัวอย่าง ผู้รับ');
});

test('SCB PLANET top-up: TO card wins over sender account and biller note', () => {
  const parsed = runtime.parseThaiSlipText([
    'SCB',
    'เติมเงินสำเร็จ',
    '07 ต.ค. 2569 - 11:38',
    'FROM',
    'น.ส. ตัวอย่าง ผู้ส่ง',
    'xxx-xxx562-9',
    'TO',
    'บัตร PLANET SCB',
    '4830 99xx xxxx 3114',
    'AMOUNT',
    '2,900.00',
    'BILLER NOTE',
    'SAMPLE PROVIDER NOTE',
  ].join('\n'), 'SCB_FIXTURE');

  assert.equal(parsed.thbAmount, 2900);
  assert.equal(parsed.date, '07/10/2569');
  assert.equal(parsed.time, '11:38');
  assert.equal(parsed.bank, 'SCB');
  assert.equal(parsed.receiverLast4, '3114');
  assert.equal(parsed.receiverName, 'บัตร PLANET SCB');
});

test('Paddle live service remains configured as first provider with safe fallbacks', () => {
  const cap = runtime.intakeCapability();
  assert.equal(cap.providers.paddleocr_vl_1_6, true);
  assert.equal(cap.paddle_backend, 'LLAMA_CPP_MULTIMODAL');
  assert.deepEqual(cap.provider_order, ['paddleocr_vl_1_6', 'xai_vision', 'ocr_space']);
});
