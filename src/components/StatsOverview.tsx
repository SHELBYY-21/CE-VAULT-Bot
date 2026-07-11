'use client';

// การ์ด KPI — glass + gradient accent + ตัวเลขนับไต่ (ธีม CE Vault)
import CountUp from './CountUp';

export interface StatsOverviewProps {
  totalNetProfitThb: number;
  totalFeeUsdt: number;
  averageFeePercent: number;
  txCount: number;
  feeWarningThreshold: number;
  currentSellRate?: number | null;
  currentMarketRate?: number | null;
  marketIsLive?: boolean;
}

interface TileProps {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  glow: string; // tailwind gradient (from-… to-…)
  icon: string;
  delay: number;
  shimmer?: boolean;
}

function Tile({ label, children, hint, glow, icon, delay, shimmer }: TileProps) {
  return (
    <div
      className={`glass glass-hover accent-top reveal relative overflow-hidden p-5 ${shimmer ? 'shimmer' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${glow} opacity-25 blur-2xl`}
      />
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--muted)]">
          {label}
        </p>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-white">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-[color:var(--muted)]">{hint}</p>}
    </div>
  );
}

export default function StatsOverview(p: StatsOverviewProps) {
  const feeHot = p.averageFeePercent > p.feeWarningThreshold;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="กำไรสุทธิรวม"
        glow="from-emerald-400 to-teal-500"
        icon="📈"
        delay={0}
        hint={`จาก ${p.txCount} รายการ`}
      >
        <span className={p.totalNetProfitThb >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          <CountUp value={p.totalNetProfitThb} decimals={2} prefix={p.totalNetProfitThb >= 0 ? '+' : ''} suffix=" ฿" />
        </span>
      </Tile>

      <Tile
        label="Average Fee"
        glow={feeHot ? 'from-rose-400 to-red-500' : 'from-emerald-400 to-green-500'}
        icon={feeHot ? '⚠️' : '🧾'}
        delay={80}
        hint={
          <>
            ค่าธรรมเนียมรวม <CountUp value={p.totalFeeUsdt} decimals={2} suffix=" USDT" />
          </>
        }
      >
        <span className={feeHot ? 'text-rose-400' : 'text-emerald-400'}>
          <CountUp value={p.averageFeePercent} decimals={2} suffix="%" />
        </span>
      </Tile>

      <Tile
        label={
          <span className="inline-flex items-center gap-1.5">
            {p.marketIsLive && <span className="live-dot inline-block" />}
            เรตตลาด {p.marketIsLive ? '(Binance TH)' : ''}
          </span>
        }
        glow="from-indigo-400 to-violet-500"
        icon="🌐"
        delay={160}
        shimmer={!!p.marketIsLive}
        hint={
          p.currentSellRate
            ? `เรตขายของเรา ${p.currentSellRate.toLocaleString('th-TH')} ฿/USDT`
            : 'ตั้งเรตขายด้วย /rate ในบอท'
        }
      >
        <span className="gradient-text">
          {p.currentMarketRate ? <CountUp value={p.currentMarketRate} decimals={2} suffix=" ฿" /> : '—'}
        </span>
      </Tile>

      <Tile label="ธุรกรรมทั้งหมด" glow="from-cyan-400 to-blue-500" icon="⚡" delay={240} hint="100 รายการล่าสุด">
        <CountUp value={p.txCount} />
      </Tile>
    </div>
  );
}
