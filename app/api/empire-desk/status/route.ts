/**
 * CE Empire Desk public connectivity probe.
 * The ChatGPT Site may read ONLY coarse service availability here.
 * No ledger, identity, admin, account, error detail or credentials are returned.
 * Business/financial data must be served through an authenticated same-origin BFF.
 */
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_ORIGIN = 'https://ce-vault-empire-desk.ce-ceo21.chatgpt.site';
const PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
  'Cache-Control': 'no-store, max-age=0',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_HEADERS });
}

export async function GET() {
  let firestore = false;
  try {
    await adminDb.collection('admins').limit(1).get();
    firestore = true;
  } catch {
    // Never publish underlying credential, connection or database errors.
  }

  return NextResponse.json({
    service: 'ce-vault-render',
    online: true,
    firestore,
    telegramWebhook: 'not_verified',
    financialData: 'requires_authenticated_session',
    checkedAt: new Date().toISOString(),
  }, { status: firestore ? 200 : 503, headers: PUBLIC_HEADERS });
}