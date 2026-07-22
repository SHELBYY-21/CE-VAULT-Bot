// Seed Firestore + Storage สำหรับ CE VAULT — รัน: node scripts/setup-db.mjs
// ต้องมี FIRESTORE_EMULATOR_HOST หรือ FIREBASE_SERVICE_ACCOUNT_JSON
import { readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  if (!existsSync('.env.local')) return {};
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-ce-vault';

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(sa), projectId: sa.project_id || projectId });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId });
  } else {
    try {
      initializeApp({ credential: applicationDefault(), projectId });
    } catch {
      initializeApp({ projectId });
    }
  }
}

const db = getFirestore();
const now = new Date().toISOString();

// admin
{
  const snap = await db.collection('admins').where('telegram_user_id', '==', 6049267196).limit(1).get();
  if (snap.empty) {
    await db.collection('admins').doc(randomUUID()).set({
      telegram_user_id: 6049267196,
      name: 'Admin (จริง)',
      holding_usdt: 0,
      created_at: now,
      updated_at: now,
    });
    console.log('admin 6049267196: inserted ✓');
  } else {
    console.log('admin 6049267196: exists ✓', snap.docs[0].id);
  }
}

// bank
{
  const snap = await db.collection('bank_accounts').limit(1).get();
  if (snap.empty) {
    await db.collection('bank_accounts').doc(randomUUID()).set({
      label: 'กสิกร - หลัก',
      bank_name: 'KBANK',
      account_number: null,
      current_balance: 0,
      created_at: now,
      updated_at: now,
    });
    console.log('bank account: inserted ✓');
  } else {
    console.log('bank account: exists ✓');
  }
}

// default rate
{
  const snap = await db.collection('rates').limit(1).get();
  if (snap.empty) {
    await db.collection('rates').doc(randomUUID()).set({
      sell_rate: Number(process.env.DEFAULT_SELL_RATE) || 35.5,
      market_usdt_rate: Number(process.env.DEFAULT_MARKET_RATE) || 34.8,
      created_at: now,
    });
    console.log('rates: seeded ✓');
  } else {
    console.log('rates: exists ✓');
  }
}

console.log('setup-db done (project=%s, emulator=%s)', projectId, process.env.FIRESTORE_EMULATOR_HOST || 'off');
