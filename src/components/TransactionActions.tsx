'use client';

/**
 * ปุ่มจัดการธุรกรรมบนแดชบอร์ด — แยกปุ่มชัดเจน
 * - แก้ไข (edit amounts)
 * - ลบ (delete + confirm)
 * - ส่งแล้ว (mark completed) — เฉพาะที่ยังไม่ completed
 * - ดูรายละเอียด (link) — optional
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Transaction } from '@/types/transactions';
import EditTransactionModal from './EditTransactionModal';

type Props = {
  transaction: Transaction;
  /** เรียกหลังลบ/แก้ไข/complete เพื่อรีเฟรชรายการ */
  onChanged?: () => void;
  /** หลังลบสำเร็จ (เช่น redirect ออกจากหน้า detail) */
  onDeleted?: () => void;
  /** โหมดแถวตาราง (compact) หรือหน้า detail (stack) */
  layout?: 'row' | 'stack';
  showDetailLink?: boolean;
};

export default function TransactionActions({
  transaction: t,
  onChanged,
  onDeleted,
  layout = 'row',
  showDetailLink = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'delete' | 'complete' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const done = t.status === 'completed';

  async function onDelete() {
    if (busy) return;
    const ok = window.confirm(
      `ลบธุรกรรมนี้?\n${t.admins?.name ?? '-'} · ${Number(t.thb_amount).toLocaleString('th-TH')} ฿ / ${Number(t.usdt_amount)} USDT\n\nการลบจะปรับ holding ของแอดมินด้วย`,
    );
    if (!ok) return;
    setBusy('delete');
    setErr(null);
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'ลบไม่สำเร็จ');
      if (onDeleted) onDeleted();
      else onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }

  async function onComplete() {
    if (busy || done) return;
    setBusy('complete');
    setErr(null);
    try {
      const res = await fetch(`/api/transactions/${t.id}/complete`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'บันทึกไม่สำเร็จ');
      onChanged?.();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }

  const btn =
    layout === 'stack'
      ? 'inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50'
      : 'inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50';

  return (
    <div
      className={
        layout === 'stack' ? 'space-y-2' : 'flex flex-wrap items-center justify-end gap-1.5'
      }
    >
      <button
        type="button"
        disabled={!!busy}
        onClick={() => setEditOpen(true)}
        className={`${btn} border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20`}
        title="แก้ไขยอด"
      >
        ✏️ แก้ไข
      </button>

      <button
        type="button"
        disabled={!!busy || done}
        onClick={onComplete}
        className={`${btn} ${
          done
            ? 'cursor-not-allowed border border-emerald-400/25 bg-emerald-500/15 text-emerald-300'
            : 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
        }`}
        title="ทำเครื่องหมายว่าส่ง USDT แล้ว"
      >
        {done ? '✓ ส่งแล้ว' : busy === 'complete' ? '…' : '💸 ส่งแล้ว'}
      </button>

      <button
        type="button"
        disabled={!!busy}
        onClick={onDelete}
        className={`${btn} border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`}
        title="ลบธุรกรรม"
      >
        {busy === 'delete' ? '…' : '🗑 ลบ'}
      </button>

      {showDetailLink && (
        <Link
          href={`/dashboard/transactions/${t.id}`}
          className={`${btn} border border-[color:var(--border)] bg-white/5 text-white/90 hover:border-emerald-400/40 hover:bg-emerald-500/10`}
        >
          รายละเอียด
        </Link>
      )}

      {err && (
        <p className={`text-xs text-rose-400 ${layout === 'row' ? 'w-full text-right' : ''}`}>
          {err}
        </p>
      )}

      <EditTransactionModal
        transaction={t}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          onChanged?.();
          router.refresh();
        }}
      />
    </div>
  );
}
