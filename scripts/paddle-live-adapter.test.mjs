import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
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

test('provider capability keeps Paddle behind conditional Typhoon and exposes live backend state', () => {
  assert.match(runtime, /preferred_model:\s*typhoon \? TYPHOON_OCR_MODEL : PADDLEOCR_MODEL/);
  assert.match(runtime, /provider_order:\s*\["typhoon_ocr_1_5",\s*"paddleocr_vl_1_6",\s*"xai_vision",\s*"ocr_space"\]/);
  assert.match(runtime, /paddle_backend:/);
});

test('provider chain tries Typhoon, then Paddle, then XAI and OCR.space', () => {
  const start = runtime.indexOf('export async function analyzeSlipBuffer');
  const end = runtime.indexOf('export function intakeCapability', start);
  assert.ok(start >= 0 && end > start);
  const block = runtime.slice(start, end);
  const typhoon = block.indexOf('analyzeWithTyphoon');
  const paddle = block.indexOf('analyzeWithPaddle');
  const xai = block.indexOf('analyzeWithXai');
  const ocrSpace = block.indexOf('analyzeWithOcrSpace');
  assert.ok(typhoon >= 0 && paddle > typhoon && xai > paddle && ocrSpace > xai);
});
