import { NextResponse } from 'next/server';
import { checkSupabaseReadiness } from '@/lib/supabase/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Independent, read-only Supabase probe. Firestore health remains /api/health. */
export async function GET() {
  const started = Date.now();
  try {
    await checkSupabaseReadiness();
    return NextResponse.json(
      { status: 'ok', database: 'supabase', latencyMs: Date.now() - started },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // Do not leak credentials, table names, counts, or database error details.
    console.error('[supabase-health]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json(
      { status: 'degraded', database: 'supabase', latencyMs: Date.now() - started },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
