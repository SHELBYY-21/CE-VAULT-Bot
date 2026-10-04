// ============================================================
// Supabase-backed compatibility shim (server-only)
// ------------------------------------------------------------
// History: module นี้เคย export Firebase Admin SDK (Firestore/Storage)
// ปัจจุบันฐานข้อมูลหลักคือ Supabase (DATABASE_PROVIDER=supabase —
// ดู src/lib/databaseProvider.ts) webhook ของ Telegram ยังเรียกใช้
// adminDb แบบ document-oriented อยู่เล็กน้อย shim ตัวนี้จึงให้บริการ
//เฉพาะ subset นั้นจาก Supabase โดย fail closed:
// - เรียกเมธอดที่ไม่รองรับ → throw ทันที (ไม่ degrade เงียบๆ)
// - ปิดกั้นถ้า DATABASE_PROVIDER ไม่ใช่ supabase
// - financial write จริงต้องผ่าน RPC ใน src/lib/transactions.ts เท่านั้น
// ============================================================
import 'server-only';
import { createSupabaseAdminClient } from './supabase/admin';
import { requireSupabaseProvider } from './databaseProvider';

export type ShimRow = Record<string, any>;

export interface ShimWriteResult {
  written: boolean;
}

export interface ShimDocumentSnapshot {
  readonly exists: boolean;
  readonly id: string;
  data(): ShimRow | undefined;
}

export interface ShimDocumentReference {
  get(): Promise<ShimDocumentSnapshot>;
  update(patch: Record<string, unknown>): Promise<ShimWriteResult>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<ShimWriteResult>;
  delete(): Promise<ShimWriteResult>;
}

export interface ShimQueryDocumentSnapshot {
  id: string;
  data(): ShimRow;
}

export interface ShimQuerySnapshot {
  readonly empty: boolean;
  readonly docs: ShimQueryDocumentSnapshot[];
}

function client() {
  requireSupabaseProvider();
  return createSupabaseAdminClient();
}

class DocumentReference implements ShimDocumentReference {
  constructor(
    private readonly table: string,
    private readonly id: string,
  ) {}

  async get(): Promise<ShimDocumentSnapshot> {
    const { data, error } = await client()
      .from(this.table)
      .select('*')
      .eq('id', this.id)
      .maybeSingle();
    if (error) {
      throw new Error('adminDb shim get failed for ' + this.table + '/' + this.id + ': ' + error.message);
    }
    const row = (data as ShimRow | null) ?? null;
    return {
      exists: row != null,
      id: this.id,
      data: () => row ?? undefined,
    };
  }

  async update(patch: Record<string, unknown>): Promise<ShimWriteResult> {
    const { error } = await client().from(this.table).update(patch).eq('id', this.id);
    if (error) {
      throw new Error('adminDb shim update failed for ' + this.table + '/' + this.id + ': ' + error.message);
    }
    return { written: true };
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<ShimWriteResult> {
    if (options?.merge) {
      return this.update(data);
    }
    const { error } = await client()
      .from(this.table)
      .upsert({ id: this.id, ...data }, { onConflict: 'id' });
    if (error) {
      throw new Error('adminDb shim set failed for ' + this.table + '/' + this.id + ': ' + error.message);
    }
    return { written: true };
  }

  async delete(): Promise<ShimWriteResult> {
    const { error } = await client().from(this.table).delete().eq('id', this.id);
    if (error) {
      throw new Error('adminDb shim delete failed for ' + this.table + '/' + this.id + ': ' + error.message);
    }
    return { written: true };
  }
}

type WhereOp = '==' | '>' | '>=' | '<' | '<=';

class Query {
  private readonly filters: { field: string; op: WhereOp; value: unknown }[] = [];
  private readonly orders: { field: string; dir: 'asc' | 'desc' }[] = [];
  private max: number | null = null;

  constructor(private readonly table: string) {}

  where(field: string, op: WhereOp, value: unknown): Query {
    this.filters.push({ field, op, value });
    return this;
  }

  orderBy(field: string, direction?: 'asc' | 'desc'): Query {
    this.orders.push({ field, dir: direction === 'desc' ? 'desc' : 'asc' });
    return this;
  }

  limit(count: number): Query {
    this.max = count;
    return this;
  }

  async get(): Promise<ShimQuerySnapshot> {
    let q = client().from(this.table).select('*');
    for (const f of this.filters) {
      switch (f.op) {
        case '==':
          q = q.eq(f.field, f.value);
          break;
        case '>':
          q = q.gt(f.field, f.value);
          break;
        case '>=':
          q = q.gte(f.field, f.value);
          break;
        case '<':
          q = q.lt(f.field, f.value);
          break;
        case '<=':
          q = q.lte(f.field, f.value);
          break;
        default:
          throw new Error('adminDb shim: unsupported operator ' + String(f.op));
      }
    }
    for (const o of this.orders) {
      q = q.order(o.field, { ascending: o.dir === 'asc' });
    }
    if (this.max != null) q = q.limit(this.max);
    const { data, error } = await q;
    if (error) {
      throw new Error('adminDb shim query failed for ' + this.table + ': ' + error.message);
    }
    const rows = (data as ShimRow[]) ?? [];
    return {
      empty: rows.length === 0,
      docs: rows.map((r) => ({ id: String(r.id), data: () => r })),
    };
  }
}

export interface AdminDbCompat {
  collection(name: string): Query & {
    doc(id: string): ShimDocumentReference;
  };
  runTransaction<T>(): Promise<T>;
}

export const adminDb: AdminDbCompat = {
  collection(name: string) {
    const query = new Query(name) as Query & { doc(id: string): ShimDocumentReference };
    (query as any).doc = (id: string) => new DocumentReference(name, id);
    return query;
  },
  runTransaction<T>(): Promise<T> {
    throw new Error(
      'adminDb shim: runTransaction is not supported — financial writes must use the Supabase RPCs in src/lib/transactions.ts',
    );
  },
};
