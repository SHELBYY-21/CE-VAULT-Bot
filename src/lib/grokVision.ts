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
  receiverName: string | null; // ชื่อผู้รับเงิน
  senderName: string | null;  // ชื่อผู้โอน (best-effort)
  confidence: number | null;  // ความมั่นใจในการอ่าน 0-100
  raw?: string;               // ข้อความดิบ (debug)
}

const PROMPT = `You are a Thai bank slip parser. Analyze this slip image and reply with ONLY a JSON object (no prose, no markdown fence) with keys:
{
  "thbAmount": number,           // amount transferred in THB (the main highlighted number)
  "time": "HH:MM",               // 24-hour transfer time
  "date": "DD/MM/YY",            // transfer date, Buddhist year → subtract 543 to Gregorian, output as YY (2-digit Gregorian)
  "receiverLast4": "XXXX",       // last 4 digits of RECEIVER (payee) account number
  "bank": "KBANK|SCB|BBL|KTB|BAY|TTB|GSB|KKP|CIMB|LH|UOB|TISCO|KEB|CITI|other-uppercase",
  "receiverName": "name or null",// RECEIVER (payee) full name — Thai or English as shown
  "senderName": "name or null",  // sender full name if visible
  "confidence": number           // 0-100 how confident you are the image is a real, clearly-legible bank slip and the amount is correct
}
If unable to read any field, use null (except confidence — always give a number). Do not invent values. Output raw JSON only.`;

// ─── USDT transfer screenshot (Binance/OKX/TronScan ฯลฯ) ───
export interface UsdtExtract {
  amount: number | null;   // จำนวน USDT ที่โอน
  network: string | null;  // TRC20 | ERC20 | BEP20 | SOL | ...
  txid: string | null;     // transaction hash
  time: string | null;     // "HH:MM"
  confidence: number | null;
  raw?: string;
}

const USDT_PROMPT = `You are a crypto (USDT) transfer screenshot parser. Reply with ONLY a JSON object (no prose, no markdown fence):
{
  "amount": number,              // USDT amount transferred (the main figure)
  "network": "TRC20|ERC20|BEP20|SOL|POLYGON|null",  // blockchain network if shown
  "txid": "transaction hash or null",
  "time": "HH:MM or null",       // 24-hour transfer time
  "confidence": number           // 0-100 how confident this is a real USDT transfer screenshot with a legible amount
}
If a field is unreadable use null (except confidence — always a number). Do not invent values. Output raw JSON only.`;

export async function analyzeUsdtWithGrok(imageUrl: string): Promise<UsdtExtract | null> {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!key || !imageUrl) return null;
  const envModel = process.env.GROK_MODEL;
  const model = !envModel || /grok-2-vision/i.test(envModel) ? 'grok-4.5' : envModel;
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0,
        messages: [{ role: 'user', content: [
          { type: 'text', text: USDT_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ] }],
      }),
    });
    if (!res.ok) { console.error('Grok USDT error:', res.status); return null; }
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
    if (first < 0 || last < 0) return { amount: null, network: null, txid: null, time: null, confidence: null, raw: text };
    const data = JSON.parse(cleaned.slice(first, last + 1));
    const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      amount: num(data.amount),
      network: str(data.network)?.toUpperCase() ?? null,
      txid: str(data.txid),
      time: str(data.time),
      confidence: num(data.confidence),
      raw: text,
    };
  } catch (e: any) {
    console.error('analyzeUsdtWithGrok error:', e?.message);
    return null;
  }
}

export async function analyzeSlipWithGrok(imageUrl: string): Promise<SlipExtract | null> {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!key || !imageUrl) return null;
  // default = grok-4.5 (รองรับ vision). self-heal: ถ้า env ยังเป็น grok-2-vision-* (รุ่นที่ถูกถอด) ให้ override
  const envModel = process.env.GROK_MODEL;
  const model = !envModel || /grok-2-vision/i.test(envModel) ? 'grok-4.5' : envModel;

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
    if (first < 0 || last < 0) return { raw: text, thbAmount: null, time: null, date: null, receiverLast4: null, bank: null, receiverName: null, senderName: null, confidence: null };
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
      receiverName: str(data.receiverName),
      senderName: str(data.senderName),
      confidence: num(data.confidence),
      raw: text,
    };
  } catch (e: any) {
    console.error('grokVision error:', e?.message);
    return null;
  }
}
