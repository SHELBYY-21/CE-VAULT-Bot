'use client';

// Financial Dashboard — Today KPI strip
// Volume · Transactions · Waiting · Completed · Profit · Wallet
import CountUp from './CountUp';
import {
  formatCompactThb,
  formatUsdt,
  type TodayKpis,
} from '@/lib/dashboardToday';

export interface FinancialTodayProps {
  kpis: TodayKpis;
  roomLabel?: string;
}

interface CellProps {
  label: string;
  delay: number;
  accent?: 'default' | 'warn' | 'good' | 'mint';
  children: React.ReactNode;
  hint?: string;
}

function Cell({ label, delay, accent = 'default', children, hint }: CellProps) {
  const valueColor =
    accent === 'warn'
      ? 'text-amber-300'
      : accent === 'good'
        ? 'text-emerald-400'
        : accent === 'mint'
          ? 'text-cyan-300'
          : 'text-white';

  return (
    <div
      className="reveal relative min-w-0 px-4 py-4 first:pl-0 last:pr-0 sm:px-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
        {label}
      </p>
      <div className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.65rem] ${valueColor}`}>
        {children}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-[color:var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export default function FinancialToday({ kpis, roomLabel }: FinancialTodayProps) {
  const dateLabel = (() => {
    try {
      return new Date(`${kpis.date}T12:00:00+07:00`).toLocaleDateString('en-GB', {
        timeZone: 'Asia/Bangkok',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return kpis.date;
    }
  })();

  return (
    <section className="glass accent-top reveal overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
            Financial Dashboard
          </p>
          <h2 className="mt-1 flex items-baseline gap-3 text-xl font-semibold tracking-tight text-white">
            Today
            <span className="text-sm font-normal text-[color:var(--muted)]">{dateLabel}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
          {roomLabel ? (
            <span className="rounded-md border border-[color:var(--border)] bg-white/[0.03] px-2.5 py-1 font-medium text-[color:var(--text)]">
              {roomLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">
            <span className="live-dot" /> Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-y divide-[color:var(--border)] sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-y-0">
        <Cell label="Volume" delay={0} accent="mint" hint="THB in today">
          <span title={`฿${kpis.volumeThb.toLocaleString('en-US')}`}>
            {formatCompactThb(kpis.volumeThb)}
          </span>
        </Cell>

        <Cell label="Transactions" delay={40} hint="All deal events">
          <CountUp value={kpis.transactions} />
        </Cell>

        <Cell
          label="Waiting"
          delay={80}
          accent={kpis.waiting > 0 ? 'warn' : 'default'}
          hint="OCR / awaiting send"
        >
          <CountUp value={kpis.waiting} />
        </Cell>

        <Cell label="Completed" delay={120} accent="good" hint="Marked done">
          <CountUp value={kpis.completed} />
        </Cell>

        <Cell
          label="Profit"
          delay={160}
          accent={kpis.profitThb >= 0 ? 'good' : 'warn'}
          hint="Net THB"
        >
          <span title={`฿${kpis.profitThb.toLocaleString('en-US')}`}>
            {formatCompactThb(kpis.profitThb)}
          </span>
        </Cell>

        <Cell label="Wallet" delay={200} accent="mint" hint="Staff holding">
          <span>
            <CountUp value={kpis.walletUsdt} decimals={0} />
            <span className="ml-1 text-base font-medium text-[color:var(--muted)]">USDT</span>
          </span>
        </Cell>
      </div>

      {/* Screen-reader / compact mirror of the requested readout */}
      <p className="sr-only">
        Today Volume {formatCompactThb(kpis.volumeThb)}, Transactions {kpis.transactions}, Waiting{' '}
        {kpis.waiting}, Completed {kpis.completed}, Profit {formatCompactThb(kpis.profitThb)}, Wallet{' '}
        {formatUsdt(kpis.walletUsdt)} USDT
      </p>
    </section>
  );
}
