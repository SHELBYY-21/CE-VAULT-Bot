import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
const runtimeModule = await import('../runtime-patches/live-intake.mjs');
const source = readFileSync(new URL('../src/lib/paddleOcr.ts', import.meta.url), 'utf8');

test('runtime supports live PaddleOCR-VL llama.cpp multimodal endpoint', () => {
  assert.match(runtime, /PADDLEOCR_LLAMA_URL/);
  assert.match(runtime, /\/v1\/chat\/completions/);
  assert.match(runtime, /image_url/);
  assert.match(runtime, /PaddleOCR-VL-1\.6-GGUF-Q4/);
  assert.match(runtime, /PADDLEOCR_VL_1_6_LLAMA/);
});

test('source OCR adapter mirrors llama.cpp support', () => {
  assert.match(source, /PADDLEOCR_LLAMA_URL/);
  assert.match(source, /\/v1\/chat\/completions/);
  assert.match(source, /image_url/);
  assert.match(source, /PADDLEOCR_VL_1_6_LLAMA/);
});

test('provider capability keeps Paddle first and exposes live backend state', () => {
  assert.match(runtime, /preferred_model:\s*PADDLEOCR_MODEL/);
  assert.match(runtime, /provider_order:\s*\["paddleocr_vl_1_6",\s*"xai_vision",\s*"ocr_space"\]/);
  assert.match(runtime, /paddle_backend:/);
});

test('llama backend falls back to XAI then OCR.space when unusable', () => {
  const start = runtime.indexOf('export async function analyzeSlipBuffer');
  const end = runtime.indexOf('export function intakeCapability', start);
  assert.ok(start >= 0 && end > start);
  const block = runtime.slice(start, end);
  const paddle = block.indexOf('analyzeWithPaddle');
  const xai = block.indexOf('analyzeWithXai');
  const ocrSpace = block.indexOf('analyzeWithOcrSpace');
  assert.ok(paddle >= 0 && xai > paddle && ocrSpace > xai);
});


test('SCB Thai transfer sample structure parses Buddhist date and receiver account correctly', () => {
  const parsed = runtimeModule.parseThaiSlipText([
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
  ].join('\n'), 'FIXTURE');
  assert.equal(parsed.thbAmount, 1000);
  assert.equal(parsed.date, '07/10/2569');
  assert.equal(parsed.time, '12:55');
  assert.equal(parsed.bank, 'SCB');
  assert.equal(parsed.receiverLast4, '5629');
  assert.equal(parsed.receiverName, 'นางสาว ตัวอย่าง ผู้รับ');
});

test('SCB PLANET top-up sample keeps receiver card and ignores provider note as receiver', () => {
  const parsed = runtimeModule.parseThaiSlipText([
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
  ].join('\n'), 'FIXTURE');
  assert.equal(parsed.thbAmount, 2900);
  assert.equal(parsed.date, '07/10/2569');
  assert.equal(parsed.time, '11:38');
  assert.equal(parsed.receiverLast4, '3114');
  assert.equal(parsed.receiverName, 'บัตร PLANET SCB');
});
