export type GrokResult = {
  amount?: number | null;
  bank?: string | null;
  date?: string | null;
  time?: string | null;
  receiverLast4?: string | null;
  receiverName?: string | null;
  senderName?: string | null;
  confidence?: number | null;
};

export async function parseWithGrok(imageUrlOrText: string): Promise<GrokResult | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const apiUrl = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';

  if (!apiKey) {
    console.warn('[Grok] GROK_API_KEY is not set');
    return null;
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROK_MODEL || 'grok-4.20-non-reasoning',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: typeof imageUrlOrText === 'string' && imageUrlOrText.startsWith('http')
              ? [
                  {
                    type: 'text',
                    text: 'You are a Thai bank slip parser. Parse the slip image and return ONLY a JSON with keys: amount (number), bank (string), date (DD/MM/YY), time (HH:MM), receiverLast4 (4 digits), receiverName (string), senderName (string), confidence (0-100).'
                  },
                  {
                    type: 'image_url',
                    image_url: { url: imageUrlOrText }
                  }
                ]
              : `Parse this slip OCR text and return ONLY JSON with keys amount, bank, date, time, receiverLast4, receiverName, senderName, confidence: ${imageUrlOrText}`
          }
        ]
      })
    });

    if (!response.ok) {
      console.error(`[Grok] API returned status ${response.status}`);
      return null;
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last >= 0) {
      const parsed = JSON.parse(cleaned.slice(first, last + 1));
      return {
        amount: typeof parsed.amount === 'number' ? parsed.amount : parseFloat(parsed.amount) || null,
        bank: parsed.bank || null,
        date: parsed.date || null,
        time: parsed.time || null,
        receiverLast4: parsed.receiverLast4 ? String(parsed.receiverLast4).replace(/\D/g, '').slice(-4) : null,
        receiverName: parsed.receiverName || null,
        senderName: parsed.senderName || null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 90,
      };
    }
    return null;
  } catch (error: any) {
    console.error('[Grok] parseWithGrok error:', error?.message || error);
    return null;
  }
}
