'use client';

// หน้าสถานะดีลสำหรับลูกค้า (public) — realtime ผ่าน Supabase
// อ่านด้วย anon client (RLS: anon อ่าน transactions ได้) + subscribe การเปลี่ยนแปลง
// แสดงเฉพาะสถานะ + ยอดของออเดอร์ตัวเอง ไม่เปิดเผยกำไร/ค่าธรรมเนียม
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { TransactionStatus } from '@/types/transactions';
import OCRSuccessCard from '@/components/status/OCRSuccessCard';
import WaitingAdminCard from '@/components/status/WaitingAdminCard';
import SuccessCard from '@/components/status/SuccessCard';

type Tx = {
  id: string;
  status: TransactionStatus | null;
  usdt_amount: number;
};

const ORDER: TransactionStatus[] = ['ocr_success', 'waiting_admin', 'completed'];
const STEP_LABEL: Record<TransactionStatus, string> = {
  ocr_success: 'ตรวจสลิป',
  waiting_admin: 'รอส่ง USDT',
  completed: 'สำเร็จ',
};

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
    let alive = true;

    (async () => {
      // select เฉพาะคอลัมน์ที่ลูกค้าเห็นได้ (ไม่มีกำไร/ค่าธรรมเนียม)
      // ถ้ายังไม่ได้รัน patch-v8 คอลัมน์ status จะไม่มี → fallback ไม่ให้ query พัง
      let data: Tx | null = null;
      const withStatus = await supabase
        .from('transactions')
        .select('id, status, usdt_amount')
        .eq('id', id)
        .maybeSingle();
      if (withStatus.error) {
        const safe = await supabase
          .from('transactions')
          .select('id, usdt_amount')
          .eq('id', id)
          .maybeSingle();
        data = safe.data ? ({ ...(safe.data as Tx), status: null }) : null;
      } else {
        data = (withStatus.data as Tx | null) ?? null;
      }
      if (!alive) return;
      setRow(data);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`tx-status-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.new) setRow((prev) => ({ ...(prev ?? {}), ...(payload.new as Tx) }));
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const status: TransactionStatus = row?.status ?? 'waiting_admin';
  const current = ORDER.indexOf(status);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-xl shadow-[0_0_20px_rgba(0,230,118,0.4)]">
          🤖
        </div>
        <h1 className="text-lg font-extrabold tracking-widest">
          CE <span className="text-emerald-300">VAULT</span>
        </h1>
        <p className="text-[11px] tracking-[0.2em] text-[color:var(--muted)]">
          สถานะรายการ (ORDER STATUS)
        </p>
      </header>

      {loading ? (
        <div className="glass p-8 text-center text-sm text-[color:var(--muted)]">
          กำลังโหลดสถานะ...
        </div>
      ) : !row ? (
        <div className="glass p-8 text-center">
          <p className="text-[color:var(--muted)]">ไม่พบรายการนี้</p>
          <p className="mt-2 text-xs text-[color:var(--muted)]">
            หากเพิ่งส่งสลิป กรุณารอสักครู่ หน้านี้จะอัปเดตอัตโนมัติ
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* progress 3 ขั้น */}
          <div className="flex items-center justify-center gap-2">
            {ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      i < current
                        ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                        : i === current
                          ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/50'
                          : 'bg-white/5 text-[color:var(--muted)] ring-1 ring-white/10'
                    }`}
                  >
                    {i < current ? '✓' : i + 1}
                  </span>
                  <span className="text-[10px] text-[color:var(--muted)]">{STEP_LABEL[s]}</span>
                </div>
                {i < ORDER.length - 1 && (
                  <span
                    className={`mb-4 h-px w-10 ${i < current ? 'bg-emerald-400/50' : 'bg-white/10'}`}
                  />
                )}
              </div>
            ))}
          </div>

          {status === 'ocr_success' && <OCRSuccessCard />}
          {status === 'waiting_admin' && <WaitingAdminCard />}
          {status === 'completed' && <SuccessCard usdt={Number(row.usdt_amount)} />}

          {status !== 'completed' && (
            <p className="text-center text-xs text-[color:var(--muted)]">
              หน้านี้อัปเดตอัตโนมัติแบบเรียลไทม์
            </p>
          )}
        </div>
      )}

      <footer className="mt-8 text-center text-[10px] tracking-[0.15em] text-[color:var(--muted)]">
        ⬢ CE VAULT · SECURE · FAST · TRUSTED · 24/7
      </footer>
    </main>
  );
}
