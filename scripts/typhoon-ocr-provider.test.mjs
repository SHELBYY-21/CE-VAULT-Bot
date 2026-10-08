import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
const sourceOcr = readFileSync(new URL('../src/lib/ocr.ts', import.meta.url), 'utf8');
const typhoon = readFileSync(new URL('../src/lib/typhoonOcr.ts', import.meta.url), 'utf8');

test('Typhoon OCR 1.5 is the conditional Thai-specialist primary provider', () => {
  assert.match(runtime, /TYPHOON_OCR_API_KEY/);
  assert.match(runtime, /TYPHOON_OCR_BASE_URL/);
  assert.match(runtime, /typhoon-ocr/);
  assert.match(runtime, /provider_order:\s*\["typhoon_ocr_1_5",\s*"paddleocr_vl_1_6",\s*"xai_vision",\s*"ocr_space"\]/);
});

test('Typhoon adapter uses the model-specific prompt and OpenAI-compatible image API', () => {
  assert.match(typhoon, /RAW_TEXT_START/);
  assert.match(typhoon, /natural_text/);
  assert.match(typhoon, /\/chat\/completions/);
  assert.match(typhoon, /image_url/);
  assert.match(typhoon, /temperature:\s*0\.1/);
  assert.match(typhoon, /top_p:\s*0\.6/);
  assert.match(typhoon, /repetition_penalty:\s*1\.2/);
});

test('source OCR order is Typhoon then Paddle then Grok then OCR.space', () => {
  const start = sourceOcr.indexOf('export async function analyzeSlip(');
  const end = sourceOcr.indexOf('/** legacy helper', start);
  assert.ok(start >= 0 && end > start);
  const block = sourceOcr.slice(start, end);
  const typhoonIndex = block.indexOf('analyzeSlipWithTyphoon');
  const paddleIndex = block.indexOf('analyzeSlipWithPaddle');
  const grokIndex = block.indexOf('analyzeSlipWithGrok');
  const ocrSpaceIndex = block.indexOf('extractThbAmountFromOcrSpace');
  assert.ok(typhoonIndex >= 0 && paddleIndex > typhoonIndex && grokIndex > paddleIndex && ocrSpaceIndex > grokIndex);
});

test('Typhoon is skipped immediately when not explicitly configured', () => {
  assert.match(typhoon, /if \(!key && !configuredBase\) return null/);
});

test('Typhoon diagnostics do not log OCR output or account data', () => {
  assert.match(typhoon, /\[CE OCR\] TYPHOON_/);
  assert.doesNotMatch(typhoon, /console\.(?:warn|error)\([^\n]*(?:natural_text|receiverName|account|base64|imageUrl)/i);
});
