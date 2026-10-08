import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const wf = readFileSync(new URL('../.github/workflows/paddle-live-inference.yml', import.meta.url), 'utf8');
const live = readFileSync(new URL('./paddle-live-inference-smoke.mjs', import.meta.url), 'utf8');

test('production build cannot fail because remote OCR is slow or unavailable', () => {
  assert.doesNotMatch(pkg.scripts.build, /test:paddle-live-inference/);
  assert.match(pkg.scripts.build, /test:paddle-live/);
});

test('live OCR proof is available as a separate explicit manual check', () => {
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /(?:^|\n)\s+(?:pull_request|push):/);
  assert.match(wf, /node scripts\/paddle-live-inference-smoke\.mjs/);
  assert.match(pkg.scripts['test:paddle-live-inference'], /node scripts\/paddle-live-inference-smoke\.mjs/);
});

test('manual OCR probe cannot silently skip or fake a green result', () => {
  assert.doesNotMatch(live, /GITHUB_WORKFLOW\s*!==/);
  assert.doesNotMatch(live, /process\.exit\(0\)/);
  assert.match(live, /assert\.equal\(response\.ok, true/);
  assert.match(live, /assert\.match\(normalized, \/12345/);
  assert.match(live, /PADDLE_LIVE_INFERENCE_FAILED/);
});
