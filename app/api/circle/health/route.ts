// GET /api/circle/health
// Soft check: are Circle credentials present? Does not call Circle APIs
// (avoids burning rate limits / leaking config via network errors).
// Protected by API_SECRET when set (same as other write-ish admin routes).

import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiAuth';
import { DEFAULT_SCP_BLOCKCHAIN, isCircleConfigured } from '@/lib/circle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const configured = isCircleConfigured();
  const blockchain = process.env.CIRCLE_SCP_BLOCKCHAIN?.trim() || DEFAULT_SCP_BLOCKCHAIN;

  return NextResponse.json({
    ok: true,
    circle: {
      configured,
      // Never echo key material — only presence flags
      hasApiKey: Boolean(process.env.CIRCLE_API_KEY?.trim()),
      hasEntitySecret: Boolean(process.env.ENTITY_SECRET?.trim()),
      defaultBlockchain: blockchain,
    },
  });
}
