// Firebase Admin (server-only) — API routes, webhook, SSR
import { readFileSync, existsSync } from 'fs';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

function loadServiceAccount(): Record<string, string> | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  return null;
}

function initAdmin(): App {
  if (getApps().length) return getApps()[0]!;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'ce88-95911';
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`;

  // Emulator: ไม่ต้องมี credentials จริง
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    return initializeApp({ projectId, storageBucket });
  }

  const sa = loadServiceAccount();
  if (sa) {
    return initializeApp({
      credential: cert(sa as any),
      projectId: sa.project_id || projectId,
      storageBucket,
    });
  }

  try {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket,
    });
  } catch {
    return initializeApp({ projectId, storageBucket });
  }
}

const app = initAdmin();

export const adminDb: Firestore = getFirestore(app);
export const adminStorage: Storage = getStorage(app);

export function storageBucketName(): string {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${app.options.projectId}.firebasestorage.app`
  );
}
