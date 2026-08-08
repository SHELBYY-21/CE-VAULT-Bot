import { readFileSync, existsSync } from 'fs';
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
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-ce-vault';
if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)), projectId });
  } else initializeApp({ projectId });
}
const db = getFirestore();
const snap = await db.collection('admins').limit(3).get();
console.log(
  'admins sample:',
  snap.docs.map((d) => ({ id: d.id, ...d.data() })),
);
