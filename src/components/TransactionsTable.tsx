// ตารางธุรกรรม — glass + row glow + badge/pill (ธีม CE Vault)
import Link from 'next/link';
import type { Transaction } from '@/types/transactions';

interface TransactionsTableProps {
  transactions: Transaction[];
  feeWarningThreshold: number;
}

function TypeBadge({ type }: { type: Transaction['type'] }) {
  const isDeposit = type === 'THB_DEPOSIT';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isDeposit
          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25'
          : 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/25'
      }`}
    >
      {isDeposit ? '↓ ฝาก' : '↑ ส่งออก'}
    </span>
  );
}

export default function TransactionsTable({
  transactions,
  feeWarningThreshold,
}: TransactionsTableProps) {
  const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

  return (
    <div className="glass accent-top reveal overflow-hidden" style={{ animationDelay: '360ms' }}>
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <span>⚡</span> ธุรกรรมล่าสุด
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--muted)]">
          <span className="live-dot" /> realtime
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-y border-[color:var(--border)] text-left text-[11px] uppercase tracking-wider text-[color:var(--muted)]">
              <th className="px-5 py-3 font-medium">เวลา</th>
              <th className="px-3 py-3 font-medium">แอดมิน</th>
              <th className="px-3 py-3 font-medium">ประเภท</th>
              <th className="px-3 py-3 text-right font-medium">THB</th>
              <th className="px-3 py-3 text-right font-medium">USDT</th>
              <th className="px-3 py-3 text-right font-medium">ค่าธรรมเนียม</th>
              <th className="px-3 py-3 font-medium">หมายเหตุ</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const isDanger = Number(t.fee_percent) > feeWarningThreshold;
              return (
                <tr
                  key={t.id}
                  className="row-glow border-b border-[color:var(--border)]/60 last:border-0"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-[color:var(--muted)]">
                    {new Date(t.created_at).toLocaleString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-3 font-medium text-white">{t.admins?.name ?? '-'}</td>
                  <td className="px-3 py-3">
                    <TypeBadge type={t.type} />
                  </td>
                  <td className="px-3 py-3 text-right text-[color:var(--text)]">
                    {nf.format(Number(t.thb_amount))}
                  </td>
                  <td className="px-3 py-3 text-right text-[color:var(--text)]">
                    {nf.format(Number(t.usdt_amount))}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${
                        isDanger
                          ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/25'
                          : 'text-[color:var(--muted)]'
                      }`}
                    >
                      {nf.format(Number(t.fee_usdt))} · {Number(t.fee_percent).toFixed(2)}%
                    </span>
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-3 text-[color:var(--muted)]">
                    {t.note ?? '-'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/dashboard/transactions/${t.id}`}
                      className="inline-flex items-center rounded-lg border border-[color:var(--border)] bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:border-emerald-400/50 hover:bg-emerald-500/15 hover:text-white"
                    >
                      ดูรายละเอียด →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-[color:var(--muted)]">
                  ยังไม่มีธุรกรรม — ส่งสลิปเข้า @CEboi88bot เพื่อเริ่มบันทึก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
