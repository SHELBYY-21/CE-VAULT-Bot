'use client';

import { useEffect, useState } from 'react';
import type { Transaction } from '@/types/transactions';

type Props = {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditTransactionModal({ transaction: t, open, onClose, onSaved }: Props) {
  const isDeposit = t.type === 'THB_DEPOSIT';
  const [thb, setThb] = useState(String(t.thb_amount ?? ''));
  const [usdt, setUsdt] = useState(String(t.usdt_amount ?? ''));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setThb(String(t.thb_amount ?? ''));
    setUsdt(String(t.usdt_amount ?? ''));
    setErr(null);
  }, [open, t.id, t.thb_amount, t.usdt_amount]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, number> = { usdtAmount: Number(usdt) };
      if (isDeposit) body.thbAmount = Number(thb);
      const res = await fetch(`/api/transactions/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || (await res.text()) || 'แก้ไขไม่สำเร็จ');
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'แก้ไขไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-tx-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="glass w-full max-w-md p-5 shadow-2xl">
        <h3 id="edit-tx-title" className="text-lg font-bold text-white">
          แก้ไขธุรกรรม
        </h3>
        <p className="mt-1 truncate text-xs text-[color:var(--muted)]">{t.id}</p>

        <div className="mt-4 space-y-3">
          {isDeposit && (
            <label className="block text-xs uppercase tracking-wide text-[color:var(--muted)]">
              THB
              <input
                type="number"
                step="any"
                min="0"
                value={thb}
                onChange={(e) => setThb(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>
          )}
          <label className="block text-xs uppercase tracking-wide text-[color:var(--muted)]">
            USDT
            <input
              type="number"
              step="any"
              min="0"
              value={usdt}
              onChange={(e) => setUsdt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        {err && <p className="mt-3 text-xs text-rose-400">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-[color:var(--border)] bg-white/5 px-4 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
