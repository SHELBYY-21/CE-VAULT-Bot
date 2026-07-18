'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OrderLookupForm() {
  const router = useRouter();
  const [id, setId] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = id.trim();
    if (!value) return;
    router.push(`/?id=${encodeURIComponent(value)}`);
  }

  return (
    <form onSubmit={onSubmit} className="glass accent-top p-5">
      <label className="text-sm font-semibold text-white" htmlFor="order-id">
        กรอกรหัสรายการ
      </label>
      <div className="mt-3 flex gap-2">
        <input
          id="order-id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="transaction id"
          className="min-w-0 flex-1 rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-[color:var(--muted)] focus:border-indigo-400/60"
        />
        <button type="submit" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
          ดูสถานะ
        </button>
      </div>
    </form>
  );
}
