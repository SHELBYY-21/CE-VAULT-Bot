import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiAuth';
import { askMistral, MistralError, validateMessages } from '@/lib/mistral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 160 * 1024;

export async function POST(req: NextRequest) {
  if (!process.env.API_SECRET) return NextResponse.json({ error: 'api_auth_not_configured' }, { status: 503 });
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;
  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) return NextResponse.json({ error: 'content_type_must_be_json' }, { status: 415 });
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    const messages = validateMessages((body as { messages?: unknown } | null)?.messages);
    const answer = await askMistral(messages);
    return NextResponse.json({ ok: true, provider: 'mistral', model: 'mistral-small-latest', answer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    if (error instanceof MistralError) {
      const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
      return NextResponse.json({ error: error.code.toLowerCase() }, { status });
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
