'use client';

// ปุ่ม "ส่ง USDT แล้ว" ในหน้า Transaction Detail (แอดมิน)
// กด → POST /api/transactions/[id]/complete → status='completed' → refresh
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MarkCompletedButtonProps {
  id: string;
  currentStatus?: string | null;
}

export default function MarkCompletedButton({ id, currentStatus }: MarkCompletedButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const done = currentStatus === 'completed';

  async function handleClick() {
    if (saving || done) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/transactions/${id}/complete`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={saving || done}
        className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          done
            ? 'cursor-not-allowed border border-emerald-400/25 bg-emerald-500/15 text-emerald-300'
            : 'border border-[color:var(--border)] bg-white/5 text-white hover:border-emerald-400/50 hover:bg-emerald-500/15'
        }`}
      >
        {done ? '✓ ส่ง USDT แล้ว' : saving ? 'กำลังบันทึก...' : '💸 ส่ง USDT แล้ว'}
      </button>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
}
