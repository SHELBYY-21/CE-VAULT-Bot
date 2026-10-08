import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSlipBuffer, intakeCapability } from '../runtime-patches/live-intake.mjs';

// No real API keys, account numbers, files or outbound calls in these tests.
const keys = [
  'TYPHOON_OCR_API_KEY','TYPHOON_OCR_BASE_URL',
  'PADDLEOCR_LLAMA_ENABLED','PADDLEOCR_LLAMA_URL',
  'PADDLEOCR_VL_URL','PADDLEOCR_BASE_URL',
  'GROK_API_KEY','XAI_API_KEY','OCR_SPACE_API_KEY',
];

test('slow Railway Paddle must be opt-in and is never contacted by default', async () => {
  const original = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const previousFetch = globalThis.fetch;
  const calls = [];
  try {
    for (const k of keys) delete process.env[k];
    process.env.PADDLEOCR_LLAMA_URL = 'https://ocr.example.invalid';
    globalThis.fetch = async (...args) => {
      calls.push(args[0]);
      throw new Error('UNEXPECTED_OUTBOUND_REQUEST');
    };
    assert.equal(intakeCapability().providers.paddleocr_vl_1_6, false);
    assert.equal(intakeCapability().paddle_backend, 'UNCONFIGURED');
    assert.equal(intakeCapability().preferred_model, 'MANUAL_REVIEW');
    const result = await analyzeSlipBuffer(Buffer.from([1, 2, 3]), 'image/png');
    assert.equal(result.provider, 'UNAVAILABLE');
    assert.deepEqual(calls, [], 'disabled fallback must not contact Railway');
  } finally {
    globalThis.fetch = previousFetch;
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  }
});

test('Paddle becomes configured only when explicitly enabled with HTTPS URL', () => {
  const original = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    process.env.PADDLEOCR_LLAMA_ENABLED = '1';
    assert.equal(intakeCapability().providers.paddleocr_vl_1_6, false);
    process.env.PADDLEOCR_LLAMA_URL = 'http://localhost:8080';
    assert.equal(intakeCapability().providers.paddleocr_vl_1_6, false, 'must not accept HTTP fallback');
    process.env.PADDLEOCR_LLAMA_URL = 'https://ocr.example.invalid';
    assert.equal(intakeCapability().providers.paddleocr_vl_1_6, true);
    assert.equal(intakeCapability().paddle_backend, 'LLAMA_CPP_MULTIMODAL');
  } finally {
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  }
});
