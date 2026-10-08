import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeSlipBuffer } from '../runtime-patches/live-intake.mjs';

// No real customers or bank account details. Pure JS PNG fixture.
const FONT = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01111','10000','10000','10000','10000','10000','01111'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['11111','00100','00100','00100','00100','00100','11111'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000']
};
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const n = Buffer.from(name, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([n, data])));
  return Buffer.concat([len, n, data, crc]);
}
export function makeSyntheticReceiptPng() {
  const width = 900, height = 360, scale = 5;
  const pixels = Buffer.alloc(width * height, 255);
  const put = (x, y) => { if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = 0; };
  function write(text, startX, startY) {
    for (let i = 0; i < text.length; i++) {
      const glyph = FONT[text[i]];
      if (!glyph) throw new Error('UNSUPPORTED_SYNTHETIC_FONT_CHAR');
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++)
          put(startX + (i * 6 + gx) * scale + sx, startY + gy * scale + sy);
      }
    }
  }
  write('SAMPLE RECEIPT', 38, 24);
  write('SCB', 38, 105);
  write('AMOUNT 1234.50 THB', 38, 177);
  write('TO TEST 4321', 38, 255);
  const raw = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit grayscale
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
export async function runSyntheticTyphoonProof() {
  const started = Date.now();
  if (!process.env.TYPHOON_OCR_API_KEY && !process.env.TYPHOON_OCR_BASE_URL) {
    console.log('[CE OCR LIVE PROOF]', JSON.stringify({ verdict: 'NOT_RUN', reason: 'TYPHOON_NOT_CONFIGURED' }));
    return false;
  }
  // Fail closed: the proof must come from Typhoon itself, not a fallback.
  process.env.PADDLEOCR_LLAMA_ENABLED = '0';
  delete process.env.PADDLEOCR_LLAMA_URL;
  delete process.env.PADDLEOCR_VL_URL;
  delete process.env.PADDLEOCR_BASE_URL;
  delete process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OCR_SPACE_API_KEY;
  process.env.TYPHOON_OCR_TIMEOUT_MS = '30000';
  try {
    const result = await analyzeSlipBuffer(makeSyntheticReceiptPng(), 'image/png');
    const passed = result.provider === 'TYPHOON_OCR_1_5' && Math.abs(Number(result.thbAmount) - 1234.5) < 0.001;
    console.log('[CE OCR LIVE PROOF]', JSON.stringify({
      verdict: passed ? 'PASS' : 'FAIL',
      provider: String(result.provider || 'UNAVAILABLE').slice(0, 50),
      amountMatched: passed,
      elapsedMs: Date.now() - started,
    }));
    return passed;
  } catch (error) {
    console.log('[CE OCR LIVE PROOF]', JSON.stringify({
      verdict: 'FAIL', reason: 'INFERENCE_ERROR',
      errorName: String(error?.name || 'Error').slice(0, 35),
      elapsedMs: Date.now() - started,
    }));
    return false;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSyntheticTyphoonProof().then(ok => { process.exitCode = ok ? 0 : 1; });
}
