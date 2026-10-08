import type { SlipExtract } from './grokVision';
import { parsePaddleThaiSlipText } from './paddleOcr';

const DEFAULT_BASE = 'https://api.opentyphoon.ai/v1';
const DEFAULT_MODEL = 'typhoon-ocr';

const TYPHOON_PROMPT = `Below is an image of a document page along with its dimensions.
Simply return the markdown representation of this document, presenting tables in markdown format as they naturally appear.
If the document contains images, use a placeholder like dummy.png for each image.
Your final output must be in JSON format with a single key \`natural_text\` containing the response.
RAW_TEXT_START

RAW_TEXT_END`;

function naturalText(content: unknown): string {
  if (typeof content !== 'string') return '';
  const cleaned = content
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\`\`\`\s*$/i, '')
    .trim();
  if (!cleaned) return '';
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed?.natural_text === 'string' ? parsed.natural_text : cleaned;
  } catch {
    return cleaned;
  }
}

export async function analyzeSlipWithTyphoon(imageUrl: string): Promise<SlipExtract | null> {
  const key = String(process.env.TYPHOON_OCR_API_KEY || '').trim();
  const configuredBase = String(process.env.TYPHOON_OCR_BASE_URL || '').trim();
  if (!key && !configuredBase) return null;
  if (!imageUrl) return null;

  const base = (configuredBase || DEFAULT_BASE).replace(/\/$/, '');
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.TYPHOON_OCR_MODEL || DEFAULT_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: TYPHOON_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
        max_tokens: Math.max(512, Math.min(Number(process.env.TYPHOON_OCR_MAX_TOKENS || 2048), 4096)),
        temperature: 0.1,
        top_p: 0.6,
        repetition_penalty: 1.2,
      }),
      signal: AbortSignal.timeout(
        Math.max(5_000, Math.min(Number(process.env.TYPHOON_OCR_TIMEOUT_MS || 15_000), 30_000)),
      ),
    });

    if (!res.ok) {
      console.warn('[CE OCR] TYPHOON_HTTP', { status: res.status, model: process.env.TYPHOON_OCR_MODEL || DEFAULT_MODEL });
      return null;
    }

    const payload: any = await res.json();
    const text = naturalText(payload?.choices?.[0]?.message?.content);
    if (!text.trim()) {
      console.warn('[CE OCR] TYPHOON_EMPTY', { model: process.env.TYPHOON_OCR_MODEL || DEFAULT_MODEL });
      return null;
    }

    const parsed = parsePaddleThaiSlipText(text);
    return parsed.thbAmount == null
      ? (console.warn('[CE OCR] TYPHOON_NO_AMOUNT', { model: process.env.TYPHOON_OCR_MODEL || DEFAULT_MODEL }), null)
      : parsed;
  } catch (error) {
    console.warn('[CE OCR] TYPHOON_ERROR', { name: error instanceof Error ? error.name : 'Error' });
    return null;
  }
}
