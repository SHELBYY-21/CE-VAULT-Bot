// Firebase client (browser) — Dashboard + status Realtime via onSnapshot
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'ce88-95911.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'ce88-95911',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    'ce88-95911.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1234567890:web:demo',
};

function getClientApp(): FirebaseApp {
  if (getApps().length) return getApps()[0]!;
  return initializeApp(firebaseConfig);
}

export const firebaseApp = getClientApp();
export const clientDb = getFirestore(firebaseApp);
export const clientStorage = getStorage(firebaseApp);

let emulatorsConnected = false;
export function connectClientEmulatorsOnce() {
  if (emulatorsConnected || typeof window === 'undefined') return;
  const useEmu =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === '1' ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.startsWith('demo-');
  if (!useEmu) return;
  try {
    connectFirestoreEmulator(clientDb, '127.0.0.1', 8080, { mockUserToken: 'owner' });
  } catch {
    /* already connected */
  }
  try {
    connectStorageEmulator(clientStorage, '127.0.0.1', 9199);
  } catch {
    /* already connected */
  }
  emulatorsConnected = true;
}
