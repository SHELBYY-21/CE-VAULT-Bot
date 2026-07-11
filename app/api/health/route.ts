// GET /api/health — เช็คว่า API ออนไลน์ + ต่อ Supabase ได้
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const startedAt = Date.now();
  let db: 'ok' | 'error' = 'ok';
  let detail: string | undefined;

  try {
    const { error } = await supabaseAdmin.from('admins').select('id').limit(1);
    if (error) {
      db = 'error';
      detail = error.message;
    }
  } catch (e: any) {
    db = 'error';
    detail = e?.message;
  }

  const latency = Date.now() - startedAt;
  const isHealthy = db === 'ok' && latency < 5000;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'ce-vault-bot-api',
      db,
      detail,
      latencyMs: latency,
      version: '2.1-optimized',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    },
    { status: isHealthy ? 200 : 503 }
  );
}
