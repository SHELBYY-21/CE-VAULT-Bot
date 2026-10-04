// Railway/container liveness probe. Keep this independent from external services.
// Database readiness remains available at /api/health (returns 503 when degraded).
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.COMMIT_REF?.slice(0, 12) ?? null;
  return NextResponse.json(
    {
      status: 'alive',
      service: 'ce-vault-web',
      commit,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
