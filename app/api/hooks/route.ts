// Generic webhook endpoint for external integrations.
// Supports GET for a simple health/info response and POST for receiving payloads.
import { NextRequest, NextResponse } from 'next/server.js';

export const runtime = 'nodejs';
export const revalidate = 0;

function getSecret(req: NextRequest): string | null {
  const header = req.headers.get('x-hook-secret') || req.headers.get('x-api-secret') || req.headers.get('authorization');
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, '').trim();
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.HOOK_SECRET || process.env.API_SECRET;
  const providedSecret = req.nextUrl.searchParams.get('secret');

  if (expectedSecret && providedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    endpoint: '/api/hooks',
    methods: ['GET', 'POST'],
    requiresSecret: Boolean(expectedSecret),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.HOOK_SECRET || process.env.API_SECRET;
  const providedSecret = getSecret(req) || req.nextUrl.searchParams.get('secret');

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const bodyText = await req.text();
  let payload: unknown = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = bodyText;
    }
  }

  const event = req.headers.get('x-hook-event') || req.headers.get('x-event-name') || req.headers.get('x-webhook-event') || 'unknown';
  const contentType = req.headers.get('content-type') || 'unknown';

  console.log(`[hook] event=${event} contentType=${contentType} payload=`, payload);

  return NextResponse.json(
    {
      ok: true,
      received: true,
      event,
      contentType,
      bodyType: typeof payload,
      timestamp: new Date().toISOString(),
    },
    { status: 202 }
  );
}
