import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../services/paddleocr-vl/Dockerfile', import.meta.url), 'utf8');
const start = readFileSync(new URL('../services/paddleocr-vl/start.sh', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');

test('Paddle runtime pins the 1.6-capable PaddleOCR release', () => {
  assert.match(dockerfile, /paddleocr\[doc-parser\]==3\.6\.0/);
  assert.match(dockerfile, /paddlepaddle==3.3.1/);
  assert.match(dockerfile, /paddlex --install serving/);
});

test('Paddle runtime uses the installed PaddlePaddle engine and exposes the service port', () => {
  assert.match(start, /paddlex --serve/);
  assert.match(start, /--pipeline/);
  assert.doesNotMatch(start, /--engine\s+transformers/);
  assert.match(start, /--port/);
  assert.match(start, /PaddleOCR-VL-1\.6/);
});

test('CE bot keeps Paddle first with safe fallbacks', () => {
  assert.match(runtime, /provider_order:\s*\["paddleocr_vl_1_6",\s*"xai_vision",\s*"ocr_space"\]/);
  assert.match(runtime, /Manual Review|OCR_FAILED|UNAVAILABLE/);
});
