// ตรวจสถานะ Firestore ของโปรเจกต์ — รัน: node scripts/verify-db.mjs
import { readFileSync, existsSync } from 'fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({
      credential: cert(sa),
      projectId: sa.project_id || projectId,
      storageBucket: bucketName,
    });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId, storageBucket: bucketName });
  } else {
    try {
      initializeApp({ credential: applicationDefault(), projectId, storageBucket: bucketName });
    } catch {
      initializeApp({ projectId, storageBucket: bucketName });
    }
  }
}

const db = getFirestore();
console.log('project:', projectId);
console.log('firestore emulator:', process.env.FIRESTORE_EMULATOR_HOST || '(cloud)');

for (const t of ['admins', 'bank_accounts', 'transactions', 'rates', 'bot_sessions', 'chat_settings', 'receivers']) {
  try {
    const snap = await db.collection(t).limit(1).get();
    const countSnap = await db.collection(t).count().get();
    const count = countSnap.data().count;
    console.log('collection', t.padEnd(15), `ok (sample=${snap.size}, count≈${count})`);
  } catch (e) {
    console.log('collection', t.padEnd(15), 'ERR:', e.message);
  }
}

try {
  const bucket = getStorage().bucket(bucketName);
  const [exists] = await bucket.exists().catch(() => [false]);
  console.log('storage bucket', bucketName, exists || process.env.FIREBASE_STORAGE_EMULATOR_HOST ? 'ok' : 'missing?');
} catch (e) {
  console.log('storage', e.message);
}
