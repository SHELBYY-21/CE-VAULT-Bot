'use client';

// ============================================================
// หน้า Dashboard หลัก (CE Vault)
// - transactions ล่าสุด + admins (holding) + เรตล่าสุด
// - การ์ดสรุป: กำไรรวม / avg fee / เรตปัจจุบัน / จำนวนธุรกรรม + holding ต่อแอดมิน
// - Live poll /api/dashboard/data every 5s (Admin SDK)
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import StatsOverview from '@/components/StatsOverview';
import AdminHoldings from '@/components/AdminHoldings';
import TransactionsTable from '@/components/TransactionsTable';
import type { Admin, Transaction } from '@/types/transactions';

const FEE_WARNING_THRESHOLD = 3;

interface RateRow {
  sell_rate: number;
  market_usdt_rate: number;
}

// คีย์ห้องของธุรกรรม (chat_id) — ธุรกรรมเก่าที่ไม่มี chat_id รวมเป็น 'legacy'
function roomKeyOf(t: Transaction): string {
  const cid = (t as any).chat_id;
  return String(cid ?? 'legacy');
}
// ชื่อห้องที่อ่านง่าย: room_name > "ห้อง <5 ตัวท้าย chat_id>" > ป้ายเก่า
function roomNameOf(t: Transaction): string {
  const cid = (t as any).chat_id;
  return (t as any).room_name || (cid ? `ห้อง ${String(cid).slice(-5)}` : 'ไม่ระบุห้อง (เก่า)');
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [rate, setRate] = useState<RateRow | null>(null);
  const [liveMarket, setLiveMarket] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // ห้องที่เลือกดูยอด: 'all' = ทุกห้อง, หรือ chat_id ที่บันทึกจากเทเลแกรม
  const [selectedRoom, setSelectedRoom] = useState<string>('all');

  async function loadDashboard() {
    try {
      const res = await fetch('/api/dashboard/data', { cache: 'no-store' });
      const json = await res.json();
      if (json?.ok) {
        setTransactions((json.transactions as Transaction[]) ?? []);
        setAdmins((json.admins as Admin[]) ?? []);
        setRate((json.rate as RateRow) ?? null);
      }
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
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
    loadDashboard();
    loadMarketRate();
    const dashPoll = setInterval(loadDashboard, 5_000);
    const marketPoll = setInterval(loadMarketRate, 30_000);
    return () => {
      clearInterval(dashPoll);
      clearInterval(marketPoll);
    };
  }, []);

  // กำไรแยกห้อง (group by chat_id) — เรียงกำไรมากสุดก่อน
  const rooms = useMemo(() => {
    const map = new Map<string, { key: string; name: string; count: number; thb: number; usdt: number; profit: number }>();
    for (const t of transactions) {
      if (t.type !== 'THB_DEPOSIT') continue;
      const key = roomKeyOf(t);
      const name = roomNameOf(t);
      const cur = map.get(key) ?? { key, name, count: 0, thb: 0, usdt: 0, profit: 0 };
      cur.count += 1;
      cur.thb += Number(t.thb_amount || 0);
      cur.usdt += Number(t.usdt_amount || 0);
      cur.profit += Number(t.net_profit_thb || 0);
      if (!cur.name && name) cur.name = name;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.profit - a.profit);
  }, [transactions]);

  // ถ้าห้องที่เลือกหายไป (ไม่มีธุรกรรมแล้ว) ให้เด้งกลับเป็น "ทุกห้อง"
  useEffect(() => {
    if (selectedRoom !== 'all' && !rooms.some((r) => r.key === selectedRoom)) {
      setSelectedRoom('all');
    }
  }, [rooms, selectedRoom]);

  // ธุรกรรมที่ผ่านตัวกรองห้อง — ใช้กับการ์ดสรุป + ตาราง + export
  const filteredTransactions = useMemo(
    () =>
      selectedRoom === 'all'
        ? transactions
        : transactions.filter((t) => roomKeyOf(t) === selectedRoom),
    [transactions, selectedRoom],
  );

  const selectedRoomName =
    selectedRoom === 'all'
      ? 'ทุกห้อง'
      : rooms.find((r) => r.key === selectedRoom)?.name ?? 'ห้องที่เลือก';

  const stats = useMemo(() => {
    const deposits = filteredTransactions.filter((t) => t.type === 'THB_DEPOSIT');
    const totalNetProfitThb = deposits.reduce((s, t) => s + Number(t.net_profit_thb), 0);
    const totalFeeUsdt = deposits.reduce((s, t) => s + Number(t.fee_usdt), 0);
    const withFee = deposits.filter((t) => Number(t.fee_percent));
    const averageFeePercent =
      withFee.length === 0
        ? 0
        : withFee.reduce((s, t) => s + Number(t.fee_percent), 0) / withFee.length;
    return { totalNetProfitThb, totalFeeUsdt, averageFeePercent, txCount: filteredTransactions.length };
  }, [filteredTransactions]);

  const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

  // Export CSV จากข้อมูลที่โหลดแล้ว (client-side — ไม่แตะ secret/endpoint)
  function exportCsv() {
    const cols = ['ledger_ref', 'created_at', 'room_name', 'thb_amount', 'usdt_amount', 'buy_rate', 'sell_rate', 'net_profit_thb', 'receiver_name', 'receiver_bank', 'receiver_last4'];
    const cell = (v: any) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredTransactions
      .filter((t) => t.type === 'THB_DEPOSIT')
      .map((t) => [cell((t as any).admins?.name), ...cols.map((c) => cell((t as any)[c]))].join(','));
    const csv = '﻿' + [['staff', ...cols].join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    const roomTag = selectedRoom === 'all' ? 'all' : selectedRoom;
    a.download = `ce-vault-${roomTag}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-lg shadow-lg shadow-emerald-500/30">
              ⬢
            </span>
            <span className="gradient-text">CE Vault</span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Secure USDT Ledger · อัปเดตแบบเรียลไทม์
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* เลือกดูยอดเฉพาะห้อง (กลุ่มเทเลแกรม) ที่บันทึกไว้ */}
          <label className="relative inline-flex items-center">
            <span className="pointer-events-none absolute left-3 text-xs">🏠</span>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              aria-label="เลือกห้องที่ต้องการดูยอด"
              className={`appearance-none rounded-full border py-1.5 pl-8 pr-8 text-xs font-medium backdrop-blur transition focus:outline-none ${
                selectedRoom === 'all'
                  ? 'border-[color:var(--border)] bg-white/5 text-[color:var(--text)] hover:bg-white/10 focus:border-emerald-400/50'
                  : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 focus:border-emerald-400/70'
              }`}
            >
              <option value="all">ทุกห้อง ({rooms.length})</option>
              {rooms.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} · {r.count} รายการ
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 text-[10px] text-[color:var(--muted)]">▼</span>
          </label>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-white/5 px-3.5 py-1.5 text-xs font-medium text-[color:var(--text)] backdrop-blur transition hover:bg-white/10"
          >
            ⬇ Export CSV
          </button>
          <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/5 px-3.5 py-1.5 text-xs font-medium text-[color:var(--text)] backdrop-blur">
            <span className="live-dot" /> LIVE
          </span>
        </div>
      </header>

      {/* แถบแสดงห้องที่กำลังดูอยู่ */}
      <div className="reveal mt-4 flex items-center gap-2 text-sm">
        <span className="text-[color:var(--muted)]">กำลังดูยอด:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          🏠 {selectedRoomName}
        </span>
        {selectedRoom !== 'all' && (
          <button
            onClick={() => setSelectedRoom('all')}
            className="text-xs font-medium text-[color:var(--muted)] underline-offset-2 transition hover:text-[color:var(--text)] hover:underline"
          >
            ล้างตัวกรอง ✕
          </button>
        )}
      </div>

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

      {/* กำไรแยกห้อง (Top Rooms) */}
      {rooms.length > 0 && (
        <div className="glass reveal mt-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-[color:var(--text)]">
              🏠 กำไรแยกห้อง <span className="text-[color:var(--muted)]">({rooms.length})</span>
            </h2>
            <span className="text-xs text-[color:var(--muted)]">คลิกห้องเพื่อกรอง · เรียงกำไรมากสุด</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--muted)]">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">ห้อง</th>
                  <th className="pb-2 text-right font-medium">รายการ</th>
                  <th className="pb-2 text-right font-medium">THB</th>
                  <th className="pb-2 text-right font-medium">USDT</th>
                  <th className="pb-2 text-right font-medium">กำไร ฿</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r, i) => {
                  const active = selectedRoom === r.key;
                  return (
                    <tr
                      key={r.key}
                      onClick={() => setSelectedRoom(active ? 'all' : r.key)}
                      className={`cursor-pointer border-t border-[color:var(--border)] transition hover:bg-white/5 ${
                        active ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/30' : ''
                      }`}
                      title={active ? 'คลิกเพื่อดูทุกห้อง' : 'คลิกเพื่อดูเฉพาะห้องนี้'}
                    >
                      <td className="py-2 text-[color:var(--muted)]">{i + 1}</td>
                      <td className="py-2 font-medium">
                        {active && <span className="mr-1 text-emerald-400">▸</span>}
                        {r.name}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.count}</td>
                      <td className="py-2 text-right tabular-nums">{nf.format(r.thb)}</td>
                      <td className="py-2 text-right tabular-nums">{nf.format(r.usdt)}</td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${r.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.profit >= 0 ? '+' : ''}{nf.format(r.profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              transactions={filteredTransactions}
              feeWarningThreshold={FEE_WARNING_THRESHOLD}
            />
          )}
        </div>
      </div>
    </main>
  );
}
