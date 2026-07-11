'use client';

// ============================================================
// หน้า Dashboard หลัก (CE Vault)
// - transactions ล่าสุด + admins (holding) + เรตล่าสุด
// - การ์ดสรุป: กำไรรวม / avg fee / เรตปัจจุบัน / จำนวนธุรกรรม + holding ต่อแอดมิน
// - Realtime: transactions + admins
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import StatsOverview from '@/components/StatsOverview';
import AdminHoldings from '@/components/AdminHoldings';
import TransactionsTable from '@/components/TransactionsTable';
import type { Admin, Transaction } from '@/types/transactions';

const FEE_WARNING_THRESHOLD = 3;

interface RateRow {
  sell_rate: number;
  market_usdt_rate: number;
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [rate, setRate] = useState<RateRow | null>(null);
  const [liveMarket, setLiveMarket] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [tx, ad, rt] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, admins(name)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('admins').select('*').order('name', { ascending: true }),
      supabase
        .from('rates')
        .select('sell_rate, market_usdt_rate')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setTransactions((tx.data as Transaction[]) ?? []);
    setAdmins((ad.data as Admin[]) ?? []);
    setRate((rt.data as RateRow) ?? null);
    setLoading(false);
  }

  async function loadMarketRate() {
    try {
      const res = await fetch('/api/market-rate', { cache: 'no-store' });
      const json = await res.json();
      if (json?.marketUsdtRate) setLiveMarket(Number(json.marketUsdtRate));
    } catch {
      /* เงียบไว้ ใช้ค่าเดิม */
    }
  }

  useEffect(() => {
    load();
    loadMarketRate();
    const poll = setInterval(loadMarketRate, 30_000); // เรตตลาดสดทุก 30 วิ

    const channel = supabase
      .channel('ce-vault-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admins' }, () => load())
      .subscribe();
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const deposits = transactions.filter((t) => t.type === 'THB_DEPOSIT');
    const totalNetProfitThb = deposits.reduce((s, t) => s + Number(t.net_profit_thb), 0);
    const totalFeeUsdt = deposits.reduce((s, t) => s + Number(t.fee_usdt), 0);
    const withFee = deposits.filter((t) => Number(t.fee_percent));
    const averageFeePercent =
      withFee.length === 0
        ? 0
        : withFee.reduce((s, t) => s + Number(t.fee_percent), 0) / withFee.length;
    return { totalNetProfitThb, totalFeeUsdt, averageFeePercent, txCount: transactions.length };
  }, [transactions]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg shadow-lg shadow-indigo-500/30">
              ⬢
            </span>
            <span className="gradient-text">CE Vault</span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Secure USDT Ledger · อัปเดตแบบเรียลไทม์
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/5 px-3.5 py-1.5 text-xs font-medium text-[color:var(--text)] backdrop-blur">
          <span className="live-dot" /> LIVE
        </span>
      </header>

      <div className="mt-6">
        <StatsOverview
          totalNetProfitThb={stats.totalNetProfitThb}
          totalFeeUsdt={stats.totalFeeUsdt}
          averageFeePercent={stats.averageFeePercent}
          txCount={stats.txCount}
          feeWarningThreshold={FEE_WARNING_THRESHOLD}
          currentSellRate={rate?.sell_rate ?? null}
          currentMarketRate={liveMarket ?? rate?.market_usdt_rate ?? null}
          marketIsLive={liveMarket != null}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AdminHoldings admins={admins} />
        </div>
        <div className="lg:col-span-2">
          {loading ? (
            <div className="glass reveal p-12 text-center text-[color:var(--muted)]">
              <span className="inline-block animate-pulse">กำลังโหลด…</span>
            </div>
          ) : (
            <TransactionsTable
              transactions={transactions}
              feeWarningThreshold={FEE_WARNING_THRESHOLD}
            />
          )}
        </div>
      </div>
    </main>
  );
}
