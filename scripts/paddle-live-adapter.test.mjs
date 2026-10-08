import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/lib/paddleOcr.ts', import.meta.url), 'utf8');

test('runtime supports live PaddleOCR-VL llama.cpp multimodal endpoint', () => {
  assert.match(runtime, /PADDLEOCR_LLAMA_URL/);
  assert.match(runtime, /\/v1\/chat\/completions/);
  assert.match(runtime, /image_url/);
  assert.match(runtime, /PADDLEOCR-VL-1\.6-GGUF-Q4/);
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
