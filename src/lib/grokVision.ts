// ============================================================
// Grok Vision — วิเคราะห์สลิปไทยแบบละเอียด (แม่นกว่า OCR.space มาก)
// ต้องตั้ง GROK_API_KEY ใน .env  (ค่า model แก้ผ่าน GROK_MODEL, default grok-2-vision-1212)
// ถ้าไม่ตั้ง key → fallback ไปที่ OCR.space
// ============================================================
export interface SlipExtract {
  thbAmount: number | null;   // ยอดโอน (บาท)
  time: string | null;        // "HH:MM"
  date: string | null;        // "DD/MM/YY"
  receiverLast4: string | null; // เลข 4 ตัวท้ายเลขบัญชีปลายทาง
  bank: string | null;        // ธนาคารปลายทาง เช่น "KBANK"
  senderName: string | null;  // ชื่อผู้โอน (best-effort)
  raw?: string;               // ข้อความดิบ (debug)
}

const PROMPT = `You are a Thai bank slip parser. Analyze this slip image and reply with ONLY a JSON object (no prose, no markdown fence) with keys:
{
  "thbAmount": number,           // amount transferred in THB (the main highlighted number)
  "time": "HH:MM",               // 24-hour transfer time
  "date": "DD/MM/YY",            // transfer date, Buddhist year → subtract 543 to Gregorian, output as YY (2-digit Gregorian)
  "receiverLast4": "XXXX",       // last 4 digits of RECEIVER (payee) account number
  "bank": "KBANK|SCB|BBL|KTB|BAY|TTB|GSB|KKP|CIMB|LH|UOB|TISCO|KEB|CITI|other-uppercase",
  "senderName": "name or null"   // sender full name if visible
}
If unable to read any field, use null. Do not invent values. Output raw JSON only.`;

export async function analyzeSlipWithGrok(imageUrl: string): Promise<SlipExtract | null> {
  const key = process.env.GROK_API_KEY;
  if (!key || !imageUrl) return null;
  const model = process.env.GROK_MODEL || 'grok-2-vision-1212';

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error('Grok API error:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? '';

    // ตัด markdown fence ออก (บางทีโมเดลใส่ ```json ...)
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last < 0) return { raw: text, thbAmount: null, time: null, date: null, receiverLast4: null, bank: null, senderName: null };
    const jsonStr = cleaned.slice(first, last + 1);
    const data = JSON.parse(jsonStr);

    const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    return {
      thbAmount: num(data.thbAmount),
      time: str(data.time),
      date: str(data.date),
      receiverLast4: str(data.receiverLast4)?.replace(/\D/g, '').slice(-4) || null,
      bank: str(data.bank)?.toUpperCase() ?? null,
      senderName: str(data.senderName),
      raw: text,
    };
  } catch (e: any) {
    console.error('grokVision error:', e?.message);
    return null;
  }
}
