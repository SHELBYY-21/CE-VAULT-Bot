// Firebase Admin (server-only) — API routes, webhook, SSR
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

function initAdmin(): App {
  if (getApps().length) return getApps()[0]!;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'demo-ce-vault';

  // Emulator: ไม่ต้องมี credentials จริง
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    return initializeApp({ projectId, storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com` });
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const sa = JSON.parse(json);
    return initializeApp({
      credential: cert(sa),
      projectId: sa.project_id || projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id || projectId}.appspot.com`,
    });
  }

  // Cloud / ADC fallback
  try {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  } catch {
    return initializeApp({
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  }
}

const app = initAdmin();

export const adminDb: Firestore = getFirestore(app);
export const adminStorage: Storage = getStorage(app);

export function storageBucketName(): string {
  return process.env.FIREBASE_STORAGE_BUCKET || `${app.options.projectId}.appspot.com`;
}
