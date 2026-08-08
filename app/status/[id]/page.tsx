'use client';

// หน้าสถานะดีลสำหรับลูกค้า (public) — อัปเดตผ่าน API poll
// ใช้ Interactive UI Cards + NOVA ตาม brandkit
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { TransactionStatus } from '@/types/transactions';
import {
  InteractiveStatusCard,
  type InteractiveCardState,
} from '@/components/brand/InteractiveCards';
import NovaMascot from '@/components/brand/NovaMascot';

type Tx = {
  id: string;
  status: TransactionStatus | null;
  usdt_amount: number;
  tx_hash?: string | null;
};

const ORDER: TransactionStatus[] = ['ocr_success', 'waiting_admin', 'completed'];
const STEP_LABEL: Record<TransactionStatus, string> = {
  ocr_success: 'ตรวจสลิป',
  waiting_admin: 'รอส่ง USDT',
  completed: 'สำเร็จ',
};

function statusToCard(status: TransactionStatus | null | undefined): InteractiveCardState {
  if (status === 'completed') return 'success';
  if (status === 'waiting_admin') return 'waiting';
  if (status === 'ocr_success') return 'loading';
  return 'waiting';
}

function InitialLoadingCard() {
  return (
    <div className="glass p-10 text-center">
      <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full border-2 border-cyan-400/40 bg-cyan-500/10" />
      <p className="text-sm font-medium text-[color:var(--text)]">กำลังโหลดสถานะ…</p>
      <p className="mt-2 text-xs text-[color:var(--muted)]">Loading order status</p>
    </div>
  );
}

function NotFoundYetCard() {
  return (
    <div className="glass p-8 text-center">
      <div className="mx-auto mb-4 flex justify-center">
        <NovaMascot expression="focused" size={72} />
      </div>
      <p className="text-lg font-bold text-[color:var(--text)]">ยังไม่พบรายการนี้</p>
      <p className="mt-2 text-sm text-[color:var(--muted)]">Not found yet</p>
      <p className="mt-4 text-xs leading-relaxed text-[color:var(--muted)]">
        หากเพิ่งส่งสลิป กรุณารอสักครู่ — หน้านี้จะอัปเดตอัตโนมัติเมื่อพบรายการ
      </p>
    </div>
  );
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
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/status/${id}`, { cache: 'no-store' });
        const json = await res.json();
        if (!alive) return;
        setRow(json?.row ?? null);
      } catch {
        /* keep previous */
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const poll = setInterval(load, 3_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [id]);

  const status: TransactionStatus = row?.status ?? 'waiting_admin';
  const current = ORDER.indexOf(status);
  const cardState = row ? statusToCard(row.status) : null;
  const mascotExpr =
    loading || !row ? 'focused' : cardState === 'success' ? 'wink' : 'happy';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-2 flex justify-center">
          <NovaMascot expression={mascotExpr} size={56} float={!loading} />
        </div>
        <h1 className="text-lg font-extrabold tracking-widest">
          CE <span className="text-emerald-300">VAULT</span>
        </h1>
        <p className="text-[11px] tracking-[0.2em] text-[color:var(--muted)]">
          สถานะรายการ (ORDER STATUS)
        </p>
      </header>

      {!loading && row && (
        <div className="mb-5 flex items-center justify-center gap-2">
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
                <span className={`mb-4 h-px w-10 ${i < current ? 'bg-emerald-400/50' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <InitialLoadingCard />
      ) : !row ? (
        <NotFoundYetCard />
      ) : (
        <InteractiveStatusCard
          state={cardState!}
          usdtAmount={Number(row.usdt_amount) || 0}
          txid={row.tx_hash ?? null}
          progress={cardState === 'loading' ? 72 : 87}
        />
      )}

      {!loading && row && status !== 'completed' && (
        <p className="mt-4 text-center text-xs text-[color:var(--muted)]">
          หน้านี้อัปเดตอัตโนมัติแบบเรียลไทม์
        </p>
      )}

      <footer className="mt-8 text-center text-[10px] tracking-[0.15em] text-[color:var(--muted)]">
        ⬢ CE VAULT · SECURE · FAST · TRUSTED · 24/7
      </footer>
    </main>
  );
}
