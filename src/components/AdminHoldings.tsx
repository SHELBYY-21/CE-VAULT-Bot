// เหรียญตกค้างต่อแอดมิน — glass + gradient ring + แถบสัดส่วน (ธีม CE Vault)
import type { Admin } from '@/types/transactions';

interface AdminHoldingsProps {
  admins: Admin[];
}

export default function AdminHoldings({ admins }: AdminHoldingsProps) {
  const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
  const totalHolding = admins.reduce((s, a) => s + Number(a.holding_usdt), 0);
  const max = Math.max(1, ...admins.map((a) => Number(a.holding_usdt)));

  return (
    <div className="glass accent-top reveal p-5" style={{ animationDelay: '320ms' }}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <span>💼</span> เหรียญตกค้างต่อแอดมิน
        </h2>
        <span className="rounded-full border border-[color:var(--border)] bg-white/5 px-3 py-1 text-xs font-bold text-indigo-300">
          รวม {nf.format(totalHolding)} USDT
        </span>
      </div>

      <ul className="space-y-3">
        {admins.map((a, i) => {
          const val = Number(a.holding_usdt);
          const pct = Math.round((val / max) * 100);
          return (
            <li key={a.id} className="reveal" style={{ animationDelay: `${360 + i * 60}ms` }}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-sm text-[color:var(--text)]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-lg shadow-indigo-500/30">
                    {a.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                  {a.name}
                </span>
                <span className="text-sm font-semibold text-white">{nf.format(val)} USDT</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
        {admins.length === 0 && (
          <li className="py-8 text-center text-sm text-[color:var(--muted)]">ยังไม่มีแอดมิน</li>
        )}
      </ul>
    </div>
  );
}
