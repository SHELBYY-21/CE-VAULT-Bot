/**
 * Slip authenticity — Forged / Edited / Duplicate
 * Display: Yes | No  (No = clean / pass)
 */
import { createHash } from 'crypto';
import { adminDb } from './firebaseAdmin';

export type AuthFlag = boolean; // true = Yes (bad), false = No (pass)

export interface SlipAuthenticity {
  forged: AuthFlag;
  edited: AuthFlag;
  duplicate: AuthFlag;
}

export const CLEAN_AUTH: SlipAuthenticity = {
  forged: false,
  edited: false,
  duplicate: false,
};

export function authLabel(flag: AuthFlag): 'Yes' | 'No' {
  return flag ? 'Yes' : 'No';
}

/** Compact console lines for Telegram cards */
export function authenticityBlock(a: SlipAuthenticity): string {
  return (
    `Forged     <code>${authLabel(a.forged)}</code>\n` +
    `Edited     <code>${authLabel(a.edited)}</code>\n` +
    `Duplicate  <code>${authLabel(a.duplicate)}</code>`
  );
}

export function isAuthClean(a: SlipAuthenticity): boolean {
  return !a.forged && !a.edited && !a.duplicate;
}

export function parseAuthBool(v: unknown): AuthFlag {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['yes', 'true', '1', 'y'].includes(s)) return true;
    if (['no', 'false', '0', 'n'].includes(s)) return false;
  }
  if (typeof v === 'number') return v !== 0;
  return false; // default No (pass) when unknown
}

/** Fingerprint for duplicate detection (same slip content, not URL) */
export function slipFingerprint(input: {
  thb: number | null;
  date: string | null;
  time: string | null;
  bank: string | null;
  last4: string | null;
}): string {
  const key = [
    input.thb != null ? input.thb.toFixed(2) : '',
    (input.date || '').trim(),
    (input.time || '').trim(),
    (input.bank || '').toUpperCase(),
    (input.last4 || '').replace(/\D/g, '').slice(-4),
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Check Firestore for a prior slip with the same fingerprint.
 * Collection: slip_fingerprints (Database 2.0 companion)
 */
export async function findDuplicateSlip(
  fingerprint: string,
): Promise<{ id: string; txId: string | null; ledgerRef: string | null } | null> {
  if (!fingerprint || fingerprint.length < 16) return null;
  try {
    const doc = await adminDb.collection('slip_fingerprints').doc(fingerprint).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return {
      id: doc.id,
      txId: (d.tx_id as string) ?? null,
      ledgerRef: (d.ledger_ref as string) ?? null,
    };
  } catch (e) {
    console.warn('[slipAuth] duplicate check failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function rememberSlipFingerprint(input: {
  fingerprint: string;
  txId?: string | null;
  ledgerRef?: string | null;
  chatId?: number | null;
  thb?: number | null;
}): Promise<void> {
  if (!input.fingerprint) return;
  try {
    await adminDb
      .collection('slip_fingerprints')
      .doc(input.fingerprint)
      .set(
        {
          fingerprint: input.fingerprint,
          tx_id: input.txId ?? null,
          ledger_ref: input.ledgerRef ?? null,
          chat_id: input.chatId ?? null,
          thb: input.thb ?? null,
          schema_version: 2,
          created_at: new Date().toISOString(),
        },
        { merge: true },
      );
  } catch (e) {
    console.warn('[slipAuth] remember fingerprint failed:', e instanceof Error ? e.message : e);
  }
}

/** Merge vision flags + duplicate DB result */
export function mergeAuthenticity(
  vision: Partial<SlipAuthenticity> | null | undefined,
  duplicate: boolean,
): SlipAuthenticity {
  return {
    forged: vision?.forged ?? false,
    edited: vision?.edited ?? false,
    duplicate: duplicate || (vision?.duplicate ?? false),
  };
}
