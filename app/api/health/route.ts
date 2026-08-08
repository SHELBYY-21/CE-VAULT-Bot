// GET /api/health — เช็คว่า API ออนไลน์ + ต่อ Firestore ได้
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const startedAt = Date.now();
  let db: 'ok' | 'error' = 'ok';
  let detail: string | undefined;

  try {
    await adminDb.collection('admins').limit(1).get();
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
      db,
      detail,
      latencyMs: latency,
      version: '3.0-firebase',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    },
    { status: isHealthy ? 200 : 503 },
  );
}
