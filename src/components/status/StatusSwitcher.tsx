'use client';

// เลือกแสดงการ์ดตามสถานะดีล 3 ขั้น: ocr_success → waiting_admin → completed
// ระหว่างยังไม่ completed จะ refresh หน้าอัตโนมัติทุก 10 วินาที
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import OCRSuccessCard from './OCRSuccessCard';
import WaitingAdminCard from './WaitingAdminCard';
import SuccessCard from './SuccessCard';

export type DealStatus = 'ocr_success' | 'waiting_admin' | 'completed';

const STEPS: { key: DealStatus; label: string }[] = [
  { key: 'ocr_success', label: 'ตรวจสลิป' },
  { key: 'waiting_admin', label: 'รอส่ง USDT' },
  { key: 'completed', label: 'สำเร็จ' },
];

export default function StatusSwitcher({
  status,
  usdt,
}: {
  status: DealStatus;
  usdt?: number | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (status === 'completed') return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [status, router]);

  const current = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="space-y-6">
      {/* แถบ progress 3 ขั้น */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
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
              <span className="text-[10px] text-[color:var(--muted)]">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={`mb-4 h-px w-10 ${i < current ? 'bg-emerald-400/50' : 'bg-white/10'}`}
              />
            )}
          </div>
        ))}
      </div>

      {status === 'ocr_success' && <OCRSuccessCard />}
      {status === 'waiting_admin' && <WaitingAdminCard />}
      {status === 'completed' && <SuccessCard usdt={usdt} />}

      {status !== 'completed' && (
        <p className="text-center text-xs text-[color:var(--muted)]">
          หน้านี้อัปเดตอัตโนมัติทุก 10 วินาที
        </p>
      )}
    </div>
  );
}
