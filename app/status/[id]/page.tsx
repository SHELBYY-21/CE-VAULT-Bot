'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type TxStatus = 'ocr_success' | 'waiting_admin' | 'completed';

type AdminRef = {
  name: string | null;
};

type Tx = {
  id: string;
  status: TxStatus | null;
  created_at: string;
  thb_amount: number;
  usdt_amount: number;
  slip_image_url: string | null;
  note: string | null;
  admins?: AdminRef | null;
};

type TxPayload = Omit<Tx, 'admins'> & {
  admins?: AdminRef | AdminRef[] | null;
};

const ORDER: TxStatus[] = ['ocr_success', 'waiting_admin', 'completed'];

const TEXT = {
  ocr_success: {
    title: '✅ OCR สำเร็จ',
    subtitle: 'สลิปจริง ข้อมูลถูกต้อง',
    badge: '🔍 กำลังตรวจสอบสลิป...',
  },
  waiting_admin: {
    title: '⏳ รอแอดมินส่ง USDT',
    subtitle: 'โดยปกติใช้เวลาไม่เกิน 15 นาที',
    badge: 'รอแอดมินดำเนินการ',
  },
  completed: {
    title: '🎉 ส่ง USDT สำเร็จ',
    subtitle: 'แอดมินดำเนินการเรียบร้อยแล้ว',
    badge: 'รายการเสร็จสมบูรณ์',
  },
} as const;

function stepClass(active: boolean) {
  return active
    ? 'border-indigo-400/50 bg-indigo-500/15 text-white'
    : 'border-[color:var(--border)] bg-white/5 text-[color:var(--muted)]';
}

function normalizeTx(row: TxPayload | null): Tx | null {
  if (!row) return null;

  const { admins, ...tx } = row;

  return {
    ...tx,
    admins: Array.isArray(admins) ? admins[0] ?? null : admins ?? null,
  };
}

export default function StatusPage() {
  const params = useParams();
  const id = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : String(raw ?? '');
  }, [params]);

  const [row, setRow] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('transactions')
        .select('id,status,created_at,thb_amount,usdt_amount,slip_image_url,note, admins(name)')
        .eq('id', id)
        .single();

      if (!cancelled) {
        setRow(normalizeTx((data as TxPayload) ?? null));
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`tx-status-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new) {
            setRow((prev) =>
              normalizeTx({
                ...((prev ?? {}) as Partial<TxPayload>),
                ...(payload.new as Partial<TxPayload>),
              } as TxPayload),
            );
            setLoading(false);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const status: TxStatus = row?.status ?? 'waiting_admin';
  const text = TEXT[status];
  const adminName = row?.admins?.name ?? '-';

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6 py-10">
        <div className="glass accent-top w-full p-6 text-center">
          <div className="text-sm text-[color:var(--muted)]">กำลังโหลดสถานะ...</div>
        </div>
      </main>
    );
  }

  if (!row) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6 py-10">
        <div className="glass accent-top w-full p-6 text-center">
          <div className="text-sm text-[color:var(--muted)]">ไม่พบรายการนี้</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <div className="mb-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300">CE Vault</div>
        <div className="mt-1 text-xs text-[color:var(--muted)]">รายการ {row.id}</div>
      </div>

      <div className="glass accent-top overflow-hidden p-5">
        <div className="mb-4 grid grid-cols-3 gap-2">
          {ORDER.map((s) => (
            <div key={s} className={`rounded-xl border px-3 py-2 text-center text-[11px] font-semibold ${stepClass(s === status)}`}>
              {s === 'ocr_success' ? 'OCR' : s === 'waiting_admin' ? 'WAIT' : 'SUCCESS'}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-white/5 p-4">
          <div className="text-center">
            <div className="text-sm font-semibold text-[color:var(--muted)]">{text.badge}</div>
            <div className="mt-3 text-2xl font-bold">{text.title}</div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">{text.subtitle}</div>
          </div>

          {status === 'ocr_success' && (
            <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
              ✓ ชื่อผู้รับตรง<br />
              ✓ เลขบัญชี 4 ตัวท้ายตรง
            </div>
          )}

          {status === 'waiting_admin' && (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              โดยปกติใช้เวลาไม่เกิน 15 นาที<br />
              หากเกิน 15 นาที กรุณาโทรหาแอดมินทันที
            </div>
          )}

          {status === 'completed' && (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              แอดมินดำเนินการเรียบร้อยแล้ว
            </div>
          )}

          <div className="mt-4 grid gap-2 text-sm text-[color:var(--muted)]">
            <div className="flex justify-between gap-4">
              <span>แอดมิน</span>
              <span className="text-white">{adminName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>THB</span>
              <span className="text-white">{Number(row.thb_amount).toLocaleString('th-TH')} ฿</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>USDT</span>
              <span className="text-white">{Number(row.usdt_amount).toLocaleString('th-TH')} USDT</span>
            </div>
          </div>
        </div>

        {row.slip_image_url && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.slip_image_url}
              alt="slip"
              className="h-80 w-full rounded-xl object-contain"
            />
          </div>
        )}

        {row.note && (
          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-white/5 p-4 text-sm text-[color:var(--muted)]">
            {row.note}
          </div>
        )}
      </div>
    </main>
  );
}
