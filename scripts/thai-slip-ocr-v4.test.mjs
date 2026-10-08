import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = await import('../runtime-patches/live-intake.mjs');
const source = readFileSync(new URL('../runtime-patches/live-intake.mjs', import.meta.url), 'utf8');
const sourceOcr = readFileSync(new URL('../src/lib/ocr.ts', import.meta.url), 'utf8');
const paddleSource = readFileSync(new URL('../src/lib/paddleOcr.ts', import.meta.url), 'utf8');

test('Thai Slip OCR V4 prefers PaddleOCR-VL-1.6 before general VLM fallbacks', () => {
  const cap = runtime.intakeCapability();
  assert.equal(cap.preferred_model, 'PaddleOCR-VL-1.6');
  assert.deepEqual(cap.provider_order.slice(0, 3), ['paddleocr_vl_1_6', 'xai_vision', 'ocr_space']);
  assert.notEqual(cap.preferred_model, 'PP-OCRv6');
});

test('PaddleOCR-VL adapter is Thai-document oriented and uses official layout-parsing contract', () => {
  assert.match(source, /PADDLEOCR_VL_URL/);
  assert.match(source, /PaddleOCR-VL-1\.6/);
  assert.match(source, /\/layout-parsing/);
  assert.match(source, /useDocOrientationClassify:\s*true/);
  assert.match(source, /useDocUnwarping:\s*true/);
  assert.match(source, /useLayoutDetection:\s*true/);
  assert.match(source, /temperature:\s*0/);
});

test('Paddle extracted text is structured with Thai slip rules without inventing fields', () => {
  const parsed = runtime.parseThaiSlipText([
    'ธนาคารกสิกรไทย',
    'โอนเงินสำเร็จ',
    'จำนวนเงิน 12,345.67 บาท',
    'ไปยัง SOMCHAI TEST',
    'xxx-x-x4321-x',
    '08/10/26 12:45',
  ].join('\n'), 'PADDLEOCR_VL_1_6');
  assert.equal(parsed.thbAmount, 12345.67);
  assert.equal(parsed.bank, 'KBANK');
  assert.equal(parsed.receiverLast4, '4321');
  assert.equal(parsed.receiverName, 'SOMCHAI TEST');
  assert.equal(parsed.provider, 'PADDLEOCR_VL_1_6');
});

test('biller receipt extraction anchors amount to payment labels instead of largest number', () => {
  const parsed = runtime.parseThaiSlipText([
    'BILLER NOTE 998877665544',
    'PUCHADA MALAI',
    'ยอดชำระ 450.00 บาท',
    'เลขอ้างอิง 123456789012345678',
  ].join('\n'), 'PADDLEOCR_VL_1_6');
  assert.equal(parsed.thbAmount, 450);
  assert.equal(parsed.receiverName, 'PUCHADA MALAI');
  assert.notEqual(parsed.thbAmount, 123456789012345678);
});

test('provider diagnostics expose only provider/status metadata, never OCR payload content', () => {
  assert.match(source, /\[CE OCR\] PADDLE/);
  assert.doesNotMatch(source, /console\.(?:warn|error)\([^\n]*(?:markdown|rawText|ocrText|base64|receiverName|account_number)/i);
});


test('source Next.js OCR path mirrors PaddleOCR-first provider order', () => {
  assert.match(sourceOcr, /analyzeSlipWithPaddle/);
  const paddleIndex = sourceOcr.indexOf('analyzeSlipWithPaddle');
  const grokIndex = sourceOcr.indexOf('analyzeSlipWithGrok');
  assert.ok(paddleIndex >= 0 && grokIndex >= 0 && paddleIndex < grokIndex);
  assert.match(paddleSource, /PaddleOCR-VL-1\.6/);
  assert.match(paddleSource, /layout-parsing/);
  assert.match(paddleSource, /useDocUnwarping:\s*true/);
});
