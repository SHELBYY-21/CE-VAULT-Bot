import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { makeSyntheticReceiptPng, runSyntheticTyphoonProof } from './typhoon-synthetic-live-probe.mjs';

test('fixture is real 900x360 8bit grayscale PNG with dark text, not a mock image description', () => {
  const png = makeSyntheticReceiptPng();
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 900);
  assert.equal(png.readUInt32BE(20), 360);
  assert.equal(png[24], 8);
  assert.equal(png[25], 0);
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const uncompressed = inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(uncompressed.length, 360 * 901);
  assert.ok(uncompressed.includes(0));
  assert.ok(uncompressed.includes(255));
});

test('smoke calls real OCR adapter only with synthetic PNG and accepts correctly parsed Typhoon response', async () => {
  const keep = { ...process.env };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    process.env.TYPHOON_OCR_API_KEY = 'SYNTHETIC_DO_NOT_SEND';
    process.env.TYPHOON_OCR_BASE_URL = 'https://mock.typhoon.invalid/v1';
    globalThis.fetch = async (url, opts) => {
      calls++;
      assert.equal(url, 'https://mock.typhoon.invalid/v1/chat/completions');
      assert.equal(opts.headers.authorization, 'Bearer SYNTHETIC_DO_NOT_SEND');
      const data = JSON.parse(opts.body);
      assert.equal(data.model, 'typhoon-ocr');
      assert.match(data.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
      assert.ok(data.messages[0].content[1].image_url.url.length > 300);
      return { ok: true, json: async () => ({
        choices: [{ message: { content: JSON.stringify({ natural_text: 'SCB\nAMOUNT 1234.50 THB\nTO TEST 4321' }) } }]
      })};
    };
    assert.equal(await runSyntheticTyphoonProof(), true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env)) if (!(name in keep)) delete process.env[name];
    for (const [name, val] of Object.entries(keep)) process.env[name] = val;
  }
});

test('no secret/body logged; real boot probe never activates without opt-in', () => {
  const source = readFileSync(new URL('./typhoon-synthetic-live-probe.mjs', import.meta.url), 'utf8');
  const startup = readFileSync(new URL('./start.mjs', import.meta.url), 'utf8');
  assert.match(startup, /CE_RUN_ONE_SHOT_TY_OCR_PROBE === '1'/);
  assert.doesNotMatch(source, /console\.\w+\([^\n]*(?:TYPHOON_OCR_API_KEY|dataUrl|buffer\.toString)/);
  assert.doesNotMatch(startup, /CE_RUN_ONE_SHOT_TY_OCR_PROBE\s*!==/);
});
