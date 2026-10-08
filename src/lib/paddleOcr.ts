import type { SlipExtract } from './grokVision';

export const PADDLEOCR_THAI_MODEL = 'PaddleOCR-VL-1.6';

function normalizeBank(value: string | null): string | null {
  const raw = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
  const aliases: Array<[RegExp, string]> = [
    [/KBANK|KASIKORN|KPLUS|กสิกร/, 'KBANK'],
    [/SCB|SIAMCOMMERCIAL|ไทยพาณิชย์/, 'SCB'],
    [/BBL|BANGKOKBANK|กรุงเทพ/, 'BBL'],
    [/KTB|KRUNGTHAI|กรุงไทย/, 'KTB'],
    [/BAY|KRUNGSRI|กรุงศรี/, 'BAY'],
    [/TTB|TMB|ธนชาต/, 'TTB'],
    [/GSB|ออมสิน/, 'GSB'],
    [/KKP|เกียรตินาคิน/, 'KKP'],
    [/CIMB/, 'CIMB'],
    [/UOB/, 'UOB'],
    [/TISCO|ทิสโก้/, 'TISCO'],
    [/TMN|TRUEMONEY|ทรูมันนี่/, 'TMN'],
  ];
  for (const [pattern, code] of aliases) if (pattern.test(raw)) return code;
  return null;
}

function amountFromLabeledText(text: string): number | null {
  const patterns = [
    /(?:จำนวนเงิน|ยอดชำระ|ยอดเงิน|ยอดโอน|จำนวนที่ชำระ|transaction\s*amount|transfer\s*amount|amount\s*paid|paid\s*amount|total\s*paid|amount)[^\d]{0,32}(\d[\d,]*(?:\.\d{1,2})?)/iu,
    /(\d[\d,]*\.\d{2})\s*(?:บาท|THB)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = Number(match[1].replaceAll(',', ''));
    if (Number.isFinite(value) && value > 0 && value <= 10_000_000) return value;
  }
  return null;
}

function accountLast4(text: string): string | null {
  const masked = /(?:x|X|•|\*)[\s\-xX•*]*?(\d{4})(?=[\s\-xX•*]|$)/u.exec(text);
  return masked?.[1] || null;
}

function receiverName(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const inline = /^(?:ไปยัง|ผู้รับ|ชื่อผู้รับ|receiver|payee)\s*[:：-]?\s*(.+)$/iu.exec(line);
    if (inline?.[1] && /[A-Za-zก-๙]/u.test(inline[1])) return inline[1].trim();
    if (/^biller\s*note\b/i.test(line)) {
      const next = lines[i + 1];
      if (next && /[A-Za-zก-๙]/u.test(next) && !/^\d[\d\s-]+$/.test(next)) return next;
    }
  }
  return null;
}

export function parsePaddleThaiSlipText(text: string): SlipExtract {
  const raw = String(text || '').trim();
  const date = raw.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/)?.[1] || null;
  const timeMatch = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;
  const thbAmount = amountFromLabeledText(raw);
  const bank = normalizeBank(raw);
  const receiverLast4 = accountLast4(raw);
  const name = receiverName(raw);
  const evidence =
    (thbAmount != null ? 45 : 0) +
    (bank ? 15 : 0) +
    (receiverLast4 ? 15 : 0) +
    (name ? 10 : 0) +
    (date ? 10 : 0) +
    (time ? 5 : 0);

  return {
    thbAmount,
    time,
    date,
    receiverLast4,
    bank,
    receiverName: name,
    senderName: null,
    confidence: thbAmount == null ? null : evidence,
  };
}

function endpoint(): string | null {
  const raw = String(process.env.PADDLEOCR_VL_URL || process.env.PADDLEOCR_BASE_URL || '').trim();
  if (!raw) return null;
  return /\/layout-parsing\/?$/i.test(raw) ? raw.replace(/\/$/, '') : `${raw.replace(/\/$/, '')}/layout-parsing`;
}

function llamaEndpoint(): string | null {
  const raw = String(
    process.env.PADDLEOCR_LLAMA_URL ||
      'https://ce-ocr-paddlevl16-production.up.railway.app',
  ).trim();
  if (!raw) return null;
  return /\/v1\/chat\/completions\/?$/i.test(raw)
    ? raw.replace(/\/$/, '')
    : `${raw.replace(/\/$/, '')}/v1/chat/completions`;
}

const LLAMA_MODEL =
  process.env.PADDLEOCR_LLAMA_MODEL ||
  'LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4:Q4_K_M';

async function analyzeSlipWithPaddleLlama(
  imageUrl: string,
): Promise<SlipExtract | null> {
  const url = llamaEndpoint();
  if (!url || !imageUrl) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        temperature: 0,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribe ALL visible text from this Thai payment receipt/slip. Preserve useful line breaks and original Thai/English/numbers. Do not summarize, calculate, translate, or invent missing values. Return plain text only.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(
        Math.max(30_000, Number(process.env.PADDLEOCR_TIMEOUT_MS || 20_000)),
      ),
    });

    if (!res.ok) {
      console.warn('[CE OCR] PADDLE_LLAMA_HTTP', {
        status: res.status,
        model: PADDLEOCR_THAI_MODEL,
      });
      return null;
    }

    const payload: any = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((part: any) =>
                typeof part === 'string' ? part : part?.text || '',
              )
              .filter(Boolean)
              .join('\n')
          : '';

    if (!text.trim()) {
      console.warn('[CE OCR] PADDLE_LLAMA_EMPTY', {
        model: PADDLEOCR_THAI_MODEL,
      });
      return null;
    }

    const parsed = parsePaddleThaiSlipText(text);
    return {
      ...parsed,
      provider: 'PADDLEOCR_VL_1_6_LLAMA',
    } as SlipExtract;
  } catch (error) {
    console.warn('[CE OCR] PADDLE_LLAMA_ERROR', {
      name: error instanceof Error ? error.name : 'Error',
      model: PADDLEOCR_THAI_MODEL,
    });
    return null;
  }
}

export async function analyzeSlipWithPaddle(imageUrl: string): Promise<SlipExtract | null> {
  const llama = await analyzeSlipWithPaddleLlama(imageUrl);
  if (llama?.thbAmount != null) return llama;

  const url = endpoint();
  if (!url || !imageUrl) return llama;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = String(process.env.PADDLEOCR_ACCESS_TOKEN || '').trim();
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        file: imageUrl,
        fileType: 1,
        useDocOrientationClassify: true,
        useDocUnwarping: true,
        useLayoutDetection: true,
        useChartRecognition: false,
        temperature: 0,
        prettifyMarkdown: false,
        visualize: false,
      }),
      signal: AbortSignal.timeout(
        Math.max(5_000, Math.min(Number(process.env.PADDLEOCR_TIMEOUT_MS || 20_000), 60_000)),
      ),
    });

    if (!res.ok) {
      console.warn('[CE OCR] PADDLE_HTTP', { status: res.status, model: PADDLEOCR_THAI_MODEL });
      return null;
    }

    const payload: any = await res.json();
    const text = (payload?.result?.layoutParsingResults || [])
      .map((item: any) => item?.markdown?.text || '')
      .filter(Boolean)
      .join('\n');

    if (!text.trim()) {
      console.warn('[CE OCR] PADDLE_EMPTY', { model: PADDLEOCR_THAI_MODEL });
      return null;
    }

    const parsed = parsePaddleThaiSlipText(text);
    if (parsed.thbAmount == null)
      console.warn('[CE OCR] PADDLE_NO_AMOUNT', { model: PADDLEOCR_THAI_MODEL });
    return parsed;
  } catch (error) {
    console.warn('[CE OCR] PADDLE_ERROR', {
      name: error instanceof Error ? error.name : 'Error',
      model: PADDLEOCR_THAI_MODEL,
    });
    return null;
  }
}
