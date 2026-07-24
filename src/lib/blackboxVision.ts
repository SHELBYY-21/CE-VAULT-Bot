// ============================================================
// Blackbox Vision — OpenAI-compatible (https://api.blackbox.ai/v1)
// ใช้เมื่อไม่มี GROK / Grok ล้มเหลว — structured slip/USDT เหมือน Grok
// ตั้ง BLACKBOX_API_KEY (+ optional BLACKBOX_MODEL, default blackboxai/blackbox-pro)
// ============================================================
import {
  SLIP_VISION_PROMPT,
  USDT_VISION_PROMPT,
  parseSlipVisionText,
  parseUsdtVisionText,
  type SlipExtract,
  type UsdtExtract,
} from './grokVision';

const DEFAULT_MODEL = 'blackboxai/blackbox-pro';
const BASE_URL = 'https://api.blackbox.ai/v1';

function pickModel(): string {
  return (process.env.BLACKBOX_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function apiKey(): string | null {
  const k = process.env.BLACKBOX_API_KEY?.trim();
  return k || null;
}

async function chatVision(prompt: string, imageUrl: string): Promise<string | null> {
  const key = apiKey();
  if (!key || !imageUrl) return null;
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: pickModel(),
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error('Blackbox API error:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const json: any = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

export async function analyzeSlipWithBlackbox(imageUrl: string): Promise<SlipExtract | null> {
  try {
    const text = await chatVision(SLIP_VISION_PROMPT, imageUrl);
    if (text == null) return null;
    return parseSlipVisionText(text);
  } catch (e: any) {
    console.error('blackboxVision slip error:', e?.message);
    return null;
  }
}

export async function analyzeUsdtWithBlackbox(imageUrl: string): Promise<UsdtExtract | null> {
  try {
    const text = await chatVision(USDT_VISION_PROMPT, imageUrl);
    if (text == null) return null;
    return parseUsdtVisionText(text);
  } catch (e: any) {
    console.error('blackboxVision USDT error:', e?.message);
    return null;
  }
}
