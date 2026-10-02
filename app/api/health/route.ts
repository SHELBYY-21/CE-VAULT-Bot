// GET /api/health — เช็คว่า API ออนไลน์ + ต่อ Supabase ได้
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const startedAt = Date.now();
  let db: 'ok' | 'error' = 'ok';
  let detail: string | undefined;

  try {
    const { error } = await createSupabaseAdminClient().from('admins').select('id').limit(1);
    if (error) throw error;
  } catch (e: any) {
    db = 'error';
    detail = e?.message ?? String(e);
  }

  const latency = Date.now() - startedAt;
  const isHealthy = db === 'ok' && latency < 5000;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'ce-vault-bot-api',
      database: 'supabase',
      db,
      detail,
      latencyMs: latency,
      version: '4.0-supabase',
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? 'unknown',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    },
    { status: isHealthy ? 200 : 503 },
  );
}