// ============================================================
// Thai Slip OCR V4 — provider order:
//   1) PaddleOCR-VL-1.6 — Thai-first document parsing
//   2) Grok Vision — semantic vision fallback
//   3) OCR.space — last-resort amount extraction
// แอดมิน /pin บัญชีวันนี้ → Vision มั่นใจ + เลขตรง = ตีสำเร็จอัตโนมัติ
// ============================================================
import { analyzeSlipWithGrok, analyzeUsdtWithGrok, SlipExtract, UsdtExtract } from './grokVision';
import { analyzeSlipWithPaddle } from './paddleOcr';
import { analyzeSlipWithTyphoon } from './typhoonOcr';

/** อ่านสกรีนช็อตโอน USDT (Grok, 12s timeout) — null ถ้าอ่านไม่ได้/ไม่มี key */
export async function analyzeUsdtScreenshot(imageUrl: string): Promise<UsdtExtract | null> {
  try {
    return await Promise.race([
      analyzeUsdtWithGrok(imageUrl),
      new Promise<UsdtExtract | null>((resolve) => setTimeout(() => resolve(null), 12000)),
    ]);
  } catch (e) {
    console.warn('USDT OCR error:', e instanceof Error ? e.message : e);
    return null;
  }
}

function pickAmount(text: string): number | null {
  const withDecimals = (text.match(/\d[\d,]*\.\d{2}/g) || []).map((m) =>
    parseFloat(m.replace(/,/g, '')),
  );
  const allInts = (text.match(/\d[\d,]{2,}/g) || []).map((m) => parseFloat(m.replace(/,/g, '')));
  const pool = (withDecimals.length ? withDecimals : allInts).filter(
    (n) => Number.isFinite(n) && n >= 10 && n <= 10_000_000,
  );
  if (pool.length === 0) return null;
  return Math.max(...pool);
}

/** อ่านสลิปครบชุด — คืน SlipExtract (fields อาจเป็น null) */
export async function analyzeSlip(imageUrl: string): Promise<SlipExtract> {
  // 1) Typhoon OCR 1.5: Thai-specialist provider. Skips immediately unless explicitly configured.
  try {
    const typhoon = await analyzeSlipWithTyphoon(imageUrl);
    if (typhoon && typhoon.thbAmount !== null && Number(typhoon.confidence || 0) >= 80) return typhoon;
  } catch (e) {
    console.warn('[CE OCR] TYPHOON_SOURCE_ERROR', { name: e instanceof Error ? e.name : 'Error' });
  }

  // 2) PaddleOCR-VL-1.6: local/self-hosted Thai-capable fallback.
  try {
    const paddle = await analyzeSlipWithPaddle(imageUrl);
    if (paddle && paddle.thbAmount !== null && Number(paddle.confidence || 0) >= 80) return paddle;
  } catch (e) {
    console.warn('[CE OCR] PADDLE_SOURCE_ERROR', { name: e instanceof Error ? e.name : 'Error' });
  }

  // 3) Grok Vision semantic fallback.
  try {
    const grok = await Promise.race([
      analyzeSlipWithGrok(imageUrl),
      new Promise<SlipExtract | null>((resolve) => setTimeout(() => resolve(null), 12000)),
    ]);
    if (grok && grok.thbAmount !== null) return grok;
  } catch (e) {
    console.warn('[CE OCR] XAI_SOURCE_ERROR', { name: e instanceof Error ? e.name : 'Error' });
  }

  // 4) fallback: OCR.space (แค่ยอด, 8s timeout)
  try {
    const thb = await Promise.race([
      extractThbAmountFromOcrSpace(imageUrl),
      new Promise<number | null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    return {
      thbAmount: thb,
      time: null,
      date: null,
      receiverLast4: null,
      bank: null,
      receiverName: null,
      senderName: null,
      confidence: thb !== null ? 70 : null, // OCR.space ไม่ให้ confidence — ประเมินกลางๆ
    };
  } catch (e) {
    console.warn('OCR fallback error:', e instanceof Error ? e.message : e);
  }

  // 5) Last resort: null values (ให้ user input เอง)
  return {
    thbAmount: null,
    time: null,
    date: null,
    receiverLast4: null,
    bank: null,
    receiverName: null,
    senderName: null,
    confidence: null,
  };
}

/** legacy helper — ใช้ในโค้ดเก่าที่รับแค่ยอด THB */
export async function extractThbAmount(imageUrl: string): Promise<number | null> {
  const r = await analyzeSlip(imageUrl);
  return r.thbAmount;
}

async function extractThbAmountFromOcrSpace(imageUrl: string): Promise<number | null> {
  const key = process.env.OCR_SPACE_API_KEY;
  if (!key || !imageUrl) return null;
  try {
    const form = new URLSearchParams({
      apikey: key,
      url: imageUrl,
      OCREngine: '2',
      scale: 'true',
      isTable: 'true',
      language: 'eng',
    });
    const res = await fetch('https://api.ocr.space/parse/imageurl', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const json: any = await res.json();
    const text: string | undefined = json?.ParsedResults?.[0]?.ParsedText;
    return text ? pickAmount(text) : null;
  } catch {
    return null;
  }
}
