import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helpers = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const source = readFileSync(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');

test('Telegram OCR path does not always send the largest photo variant', () => {
  assert.doesNotMatch(helpers, /message\.photo\[message\.photo\.length\s*-\s*1\]/);
  assert.doesNotMatch(source, /msg\.photo\[msg\.photo\.length\s*-\s*1\]\.file_id/);
  assert.match(helpers, /1_200_000|1200000/);
});

test('Paddle llama prompt stays minimal for latency-sensitive OCR', () => {
  assert.match(runtime, /const PADDLE_LLAMA_PROMPT\s*=\s*["']OCR:["']/);
  assert.match(runtime, /max_tokens:\s*(?:256|384|512)/);
});

test('Paddle timeout remains bounded so fallback can continue', () => {
  assert.match(runtime, /AbortSignal\.timeout/);
  assert.match(runtime, /PADDLE_LLAMA_HTTP/);
  assert.match(runtime, /analyzeWithXai/);
  assert.match(runtime, /analyzeWithOcrSpace/);
});
