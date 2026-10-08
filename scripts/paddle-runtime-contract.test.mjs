import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../services/paddleocr-vl/Dockerfile', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');

test('Paddle runtime pins the live low-memory 1.6 multimodal model', () => {
  assert.match(dockerfile, /ghcr\.io\/ggml-org\/llama\.cpp:server/);
  assert.match(dockerfile, /PaddleOCR-VL-1\.6-GGUF-Q4:Q4_K_M/);
  assert.match(dockerfile, /\/app\/llama-server/);
});

test('Paddle runtime exposes OpenAI-compatible multimodal serving on 8080', () => {
  assert.match(dockerfile, /--host", "0\.0\.0\.0"/);
  assert.match(dockerfile, /--port", "8080"/);
  assert.match(dockerfile, /"-c", "1024"/);
  assert.match(dockerfile, /"-np", "1"/);
});

test('CE bot keeps Paddle first with safe fallbacks', () => {
  assert.match(runtime, /provider_order:\s*\["paddleocr_vl_1_6",\s*"xai_vision",\s*"ocr_space"\]/);
  assert.match(runtime, /Manual Review|OCR_FAILED|UNAVAILABLE/);
});
