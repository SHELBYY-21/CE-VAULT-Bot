// ============================================================
// Receiver History — Firestore
// ============================================================
import { createHash, randomUUID } from 'crypto';
import { adminDb } from './firebaseAdmin';
import { isFirestoreIndexError } from './transactions';

export interface ReceiverStats {
  id: string;
  bank: string | null;
  receiver_name: string | null;
  account_last4: string;
  total_transactions: number;
  total_amount_thb: number;
  total_usdt: number;
  max_amount_thb: number;
  last_amount_thb: number;
  first_transaction_at: string | null;
  last_transaction_at: string | null;
  last_ledger_ref: string | null;
  status: 'normal' | 'trusted' | 'blacklist';
  todayCount?: number;
  todayThb?: number;
}

export function receiverHash(bank: string | null | undefined, last4: string): string {
  return createHash('sha256').update(`${(bank || 'UNKNOWN').toUpperCase()}|${last4}`).digest('hex');
}

export async function getReceiver(
  bank: string | null | undefined,
  last4: string,
): Promise<ReceiverStats | null> {
  try {
    const hash = receiverHash(bank, last4);
    const snap = await adminDb.collection('receivers').where('account_hash', '==', hash).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    const data = { id: doc.id, ...doc.data() } as ReceiverStats;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sinceIso = start.toISOString();

    let todaySnap;
    try {
      todaySnap = await adminDb
        .collection('transactions')
        .where('receiver_id', '==', data.id)
        .where('created_at', '>=', sinceIso)
        .get();
    } catch (e) {
      // Fallback เฉพาะเมื่อขาด composite index — error อื่นให้ throw ต่อ
      if (!isFirestoreIndexError(e)) {
        console.error('[getReceiver] today stats query failed:', e);
        throw e;
      }
      console.warn(
        '[getReceiver] missing index for receiver_id+created_at — using in-memory fallback',
      );
      const all = await adminDb.collection('transactions').where('receiver_id', '==', data.id).get();
      todaySnap = {
        docs: all.docs.filter((d) => String(d.data().created_at || '') >= sinceIso),
      } as typeof all;
    }

    const rows = todaySnap.docs.map((d) => d.data());
    return {
      ...data,
      todayCount: rows.length,
      todayThb: rows.reduce((s, r: any) => s + Number(r.thb_amount || 0), 0),
    };
  } catch (e) {
    console.error('[getReceiver] failed:', e);
    return null;
  }
}

export async function findReceiversByLast4(last4: string): Promise<ReceiverStats[]> {
  try {
    const snap = await adminDb
      .collection('receivers')
      .where('account_last4', '==', last4)
      .orderBy('total_amount_thb', 'desc')
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReceiverStats);
  } catch {
    return [];
  }
}

export async function upsertReceiverOnDeposit(input: {
  bank: string | null;
  last4: string;
  receiverName: string | null;
  thb: number;
  usdt: number;
  ledgerRef: string;
}): Promise<string | null> {
  try {
    const hash = receiverHash(input.bank, input.last4);
    const now = new Date().toISOString();
    const snap = await adminDb.collection('receivers').where('account_hash', '==', hash).limit(1).get();

    if (snap.empty) {
      const id = randomUUID();
      await adminDb.collection('receivers').doc(id).set({
        account_hash: hash,
        bank: input.bank,
        receiver_name: input.receiverName,
        account_last4: input.last4,
        total_transactions: 1,
        total_amount_thb: input.thb,
        total_usdt: input.usdt,
        max_amount_thb: input.thb,
        last_amount_thb: input.thb,
        first_transaction_at: now,
        last_transaction_at: now,
        last_ledger_ref: input.ledgerRef,
        status: 'normal',
      });
      return id;
    }

    const oldDoc = snap.docs[0]!;
    const old = oldDoc.data();
    const nextCount = Number(old.total_transactions) + 1;
    await oldDoc.ref.update({
      receiver_name: input.receiverName || old.receiver_name,
      bank: input.bank || old.bank,
      total_transactions: nextCount,
      total_amount_thb: Number(old.total_amount_thb) + input.thb,
      total_usdt: Number(old.total_usdt) + input.usdt,
      max_amount_thb: Math.max(Number(old.max_amount_thb), input.thb),
      last_amount_thb: input.thb,
      last_transaction_at: now,
      last_ledger_ref: input.ledgerRef,
      status: old.status === 'blacklist' ? 'blacklist' : nextCount >= 20 ? 'trusted' : old.status,
    });
    return oldDoc.id;
  } catch {
    return null;
  }
}
