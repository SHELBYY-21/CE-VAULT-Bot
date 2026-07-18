'use client';

import { useState } from 'react';

interface MarkCompletedButtonProps {
  id: string;
  currentStatus?: string | null;
}

export default function MarkCompletedButton({ id, currentStatus }: MarkCompletedButtonProps) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(currentStatus ?? 'waiting_admin');
  const done = status === 'completed';

  async function handleClick() {
    if (saving || done) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${id}/complete`, { method: 'POST' });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      setStatus('completed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saving || done}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
        done
          ? 'cursor-not-allowed border border-emerald-400/25 bg-emerald-500/15 text-emerald-300'
          : 'border border-[color:var(--border)] bg-white/5 text-white hover:border-indigo-400/50 hover:bg-indigo-500/15'
      }`}
    >
      {done ? 'ส่งแล้ว' : saving ? 'กำลังบันทึก...' : 'ส่ง USDT แล้ว'}
    </button>
  );
}
