'use client';

// ============================================================
// CE EMPIRE DESK — Dashboard หลัก (CE Vault) · Redesign v2
// ธีม: กรมท่าเข้ม + ทอง + cyan ตาม design system (Space Grotesk/Mono mood)
// โครงสร้าง: Hero → KPI → Transaction Flow → กำไรแยกห้อง → Holding/ตาราง → Companion
// Logic เดิมทั้งหมด: Live poll /api/dashboard/data ทุก 5s, กรองห้อง,
// stats (กำไร/fee/เรต), Export CSV — ไม่แตะ business logic เลย
// หมายเหตุความถูกต้อง: status จริงมี 3 ค่า (ocr_success/waiting_admin/completed)
// flow ด้านล่าง map ตรงตามข้อมูลจริง — ไม่มีการแสดง "settled" ก่อนตรวจสอบจริง
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import AdminHoldings from '@/components/AdminHoldings';
import TransactionsTable from '@/components/TransactionsTable';
import ComposioSessionCard from '@/components/ComposioSessionCard';
import CEMascot from '@/components/brand/CEMascot';
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
  // สถานะการเชื่อมต่อล่าสุด (แสดงในการ์ด Companion — ตรงตามจริง)
  const [syncOk, setSyncOk] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string>('');
  // วันที่ปัจจุบัน (Asia/Bangkok) — คำนวณหลัง mount กัน hydration mismatch
  const [today, setToday] = useState('');

  async function loadDashboard() {
    try {
      const res = await fetch('/api/dashboard/data', { cache: 'no-store' });
      const json = await res.json();
      if (json?.ok) {
        setTransactions((json.transactions as Transaction[]) ?? []);
        setAdmins((json.admins as Admin[]) ?? []);
        setRate((json.rate as RateRow) ?? null);
        setSyncOk(true);
      }
    } catch {
      setSyncOk(false);
      /* keep previous */
    } finally {
      setLastSyncAt(
        new Intl.DateTimeFormat('th-TH', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()),
      );
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

  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' }).format(new Date()),
    );
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

  // stats เดิม (กำไรรวม / avg fee / จำนวนรายการ) — คงการคำนวณเดิมทุกประการ
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

  // KPI ชุดใหม่ (CE Empire Desk) — คำนวณจากข้อมูลจริงเท่านั้น
  const kpis = useMemo(() => {
    const deposits = filteredTransactions.filter((t) => t.type === 'THB_DEPOSIT');
    const totalThb = deposits.reduce((s, t) => s + Number(t.thb_amount || 0), 0);
    const totalUsdtOut = deposits.reduce((s, t) => s + Number(t.usdt_amount || 0), 0);
    const pending = deposits.filter((t) => (t.status ?? 'waiting_admin') !== 'completed');
    const pendingUsdt = pending.reduce((s, t) => s + Number(t.usdt_amount || 0), 0);
    const flow = {
      ocr: deposits.filter((t) => t.status === 'ocr_success').length,
      wait: deposits.filter((t) => (t.status ?? 'waiting_admin') === 'waiting_admin').length,
      done: deposits.filter((t) => t.status === 'completed').length,
    };
    return { totalThb, totalUsdtOut, pendingUsdt, pendingCount: pending.length, flow };
  }, [filteredTransactions]);

  const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
  const feeHot = stats.averageFeePercent > FEE_WARNING_THRESHOLD;
  const marketRate = liveMarket ?? rate?.market_usdt_rate ?? null;

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
    const csv = '\ufeff' + [['staff', ...cols].join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    const roomTag = selectedRoom === 'all' ? 'all' : selectedRoom;
    a.download = `ce-vault-${roomTag}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ce-empire-dashboard min-h-screen bg-[#03070F] text-[#E4F4FC]">
      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* ── HERO ── */}
        <header className="ce-empire-hero reveal">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <CEMascot expression="happy" size={64} armR={-14} />
              <div>
                <p className="ce-empire-eyebrow">
                  CE EMPIRE / VAULT · OPERATIONS DESK
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">
                  CE VAULT · ภาพรวมการเงิน
                  <span className="ml-3 hidden align-middle text-xs font-semibold uppercase tracking-[.25em] text-[#F0B429] sm:inline">
                    BUILD · GROW · EMPOWER
                  </span>
                </h1>
                <p className="mt-1 text-sm text-[rgba(228,244,252,.6)]">
                  ทุกความเคลื่อนไหว ในมุมมองเดียว
                  {today && (
                    <span className="ml-2 font-mono text-xs text-[rgba(228,244,252,.35)]">
                      {today} · UTC+7
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/brand"
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(240,180,41,.28)] bg-[rgba(240,180,41,.08)] px-3.5 py-1.5 text-xs font-semibold text-[#FFD766] transition hover:bg-[rgba(240,180,41,.16)]"
              >
                Brand Kit
              </a>
              {/* เลือกดูยอดเฉพาะห้อง (กลุ่มเทเลแกรม) ที่บันทึกไว้ */}
              <label className="relative inline-flex items-center">
                <span className="pointer-events-none absolute left-3 text-xs">🏠</span>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  aria-label="เลือกห้องที่ต้องการดูยอด"
                  className={`appearance-none rounded-full border py-1.5 pl-8 pr-8 text-xs font-semibold transition focus:outline-none ${
                    selectedRoom === 'all'
                      ? 'border-[rgba(0,212,255,.22)] bg-[rgba(0,212,255,.05)] text-[#E4F4FC] hover:bg-[rgba(0,212,255,.12)] focus:border-[rgba(0,212,255,.5)]'
                      : 'border-[rgba(240,180,41,.4)] bg-[rgba(240,180,41,.1)] text-[#FFD766] hover:bg-[rgba(240,180,41,.18)] focus:border-[rgba(240,180,41,.7)]'
                  }`}
                >
                  <option value="all">ทุกห้อง ({rooms.length})</option>
                  {rooms.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} · {r.count} รายการ
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 text-[10px] text-[rgba(228,244,252,.4)]">▼</span>
              </label>
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,212,255,.22)] bg-[rgba(0,212,255,.05)] px-3.5 py-1.5 text-xs font-semibold text-[#E4F4FC] transition hover:bg-[rgba(0,212,255,.12)]"
              >
                ⬇ Export CSV
              </button>
              <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,212,255,.22)] bg-[rgba(0,212,255,.05)] px-3.5 py-1.5 text-xs font-semibold text-[#E4F4FC]">
                <span className="live-dot" /> LIVE
              </span>
            </div>
          </div>
        </header>

        {/* ── แถบแสดงห้องที่กำลังดูอยู่ ── */}
        <div className="reveal mt-4 flex items-center gap-2 text-sm">
          <span className="text-[rgba(228,244,252,.55)]">กำลังดูยอด:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,212,255,.28)] bg-[rgba(0,212,255,.07)] px-3 py-1 text-xs font-semibold text-[#00D4FF]">
            🏠 {selectedRoomName}
          </span>
          {selectedRoom !== 'all' && (
            <button
              onClick={() => setSelectedRoom('all')}
              className="text-xs font-medium text-[rgba(228,244,252,.45)] underline-offset-2 transition hover:text-[#E4F4FC] hover:underline"
            >
              ล้างตัวกรอง ✕
            </button>
          )}
        </div>

        <ComposioSessionCard />

        {/* ── KPI BAND (ข้อมูลจริงจาก /api/dashboard/data) ── */}
        <div className="reveal mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="KPI จากข้อมูล API จริง">
          <div className="rounded-2xl border border-[rgba(0,212,255,.14)] bg-[#080E18] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              ยอดรับรวม
            </p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#00D4FF]">
              {nf.format(kpis.totalThb)}
              <span className="ml-1.5 text-xs font-semibold text-[rgba(228,244,252,.4)]">THB</span>
            </p>
            <p className="mt-1 text-xs text-[rgba(228,244,252,.4)]">รวมยอดฝากจากรายการใน Ledger ที่เลือก</p>
          </div>

          <div className="rounded-2xl border border-[rgba(240,180,41,.22)] bg-[#080E18] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              ยอด USDT ในรายการฝาก
            </p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#FFD766]">
              {nf.format(kpis.totalUsdtOut)}
              <span className="ml-1.5 text-xs font-semibold text-[rgba(228,244,252,.4)]">USDT</span>
            </p>
            <p className="mt-1 text-xs text-[rgba(228,244,252,.4)]">ยอด USDT ตามรายการฝาก — ไม่ใช่ยอดยืนยันส่งจริง</p>
          </div>

          <div className="rounded-2xl border border-[rgba(255,109,53,.2)] bg-[#080E18] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              รายการยังไม่ completed
            </p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#FF6D35]">
              {nf.format(kpis.pendingUsdt)}
              <span className="ml-1.5 text-xs font-semibold text-[rgba(228,244,252,.4)]">USDT</span>
            </p>
            <p className="mt-1 text-xs text-[rgba(228,244,252,.4)]">
              {kpis.pendingCount} รายการที่ยังไม่ completed ในระบบเดิม
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(0,230,118,.18)] bg-[#080E18] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              กำไรสุทธิ
            </p>
            <p className={`mt-2 font-mono text-2xl font-bold ${stats.totalNetProfitThb >= 0 ? 'text-[#00E676]' : 'text-[#FF5252]'}`}>
              {stats.totalNetProfitThb >= 0 ? '+' : ''}
              {nf.format(stats.totalNetProfitThb)}
              <span className="ml-1.5 text-xs font-semibold text-[rgba(228,244,252,.4)]">THB</span>
            </p>
            <p className="mt-1 text-xs text-[rgba(228,244,252,.4)]">คำนวณจากธุรกรรมจริง · {stats.txCount} รายการ</p>
          </div>

          <div className="rounded-2xl border border-[rgba(179,157,219,.2)] bg-[#080E18] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              เรตขาย / ตลาด
            </p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#B39DDB]">
              {rate?.sell_rate != null ? nf.format(rate.sell_rate) : '—'}
              <span className="ml-1.5 text-xs font-semibold text-[rgba(228,244,252,.4)]">THB/USDT</span>
            </p>
            <p className="mt-1 text-xs text-[rgba(228,244,252,.4)]">
              {marketRate != null ? (
                <>
                  ตลาด {nf.format(marketRate)}
                  {liveMarket != null && <span className="ml-1.5 text-[#00E676]">● LIVE</span>}
                </>
              ) : (
                'รอข้อมูลตลาด'
              )}
            </p>
          </div>

          <div className={`rounded-2xl border bg-[#080E18] p-5 ${feeHot ? 'border-[rgba(255,82,82,.25)]' : 'border-[rgba(0,230,118,.18)]'}`}>
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              Average Fee {feeHot && '⚠️'}
            </p>
            <p className={`mt-2 font-mono text-2xl font-bold ${feeHot ? 'text-[#FF5252]' : 'text-[#00E676]'}`}>
              {nf.format(stats.averageFeePercent)}
              <span className="ml-1.5 text-xs font-semibold text-[rgba(228,244,252,.4)]">%</span>
            </p>
            <p className="mt-1 text-xs text-[rgba(228,244,252,.4)]">
              ค่าธรรมเนียมรวม {nf.format(stats.totalFeeUsdt)} USDT
            </p>
          </div>
        </div>

        {/* ── Existing three-state flow: presentation only, no new settlement semantics ── */}
        <p className="ce-status-note mt-5">ข้อมูลสถานะจากระบบปัจจุบัน: OCR SUCCESS / WAITING ADMIN / COMPLETED · การบันทึกรายการไม่ใช่หลักฐาน Settlement</p>
        <div className="reveal mt-6 rounded-2xl border border-[rgba(0,212,255,.14)] bg-[#080E18] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[rgba(228,244,252,.4)]">
              สถานะงาน
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[#F0B429]">Transaction Flow</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[rgba(0,212,255,.18)] bg-[#0C1520] p-3.5">
              <p className="font-mono text-[10px] font-bold text-[rgba(228,244,252,.35)]">01</p>
              <p className="mt-0.5 text-sm font-bold text-[#00D4FF]">OCR <span className="text-xs font-semibold text-[rgba(228,244,252,.5)]">อ่านสลิป</span></p>
              <p className="mt-1 font-mono text-xl font-bold">{kpis.flow.ocr}</p>
            </div>
            <div className="rounded-xl border border-[rgba(240,180,41,.25)] bg-[#0C1520] p-3.5">
              <p className="font-mono text-[10px] font-bold text-[rgba(228,244,252,.35)]">02</p>
              <p className="mt-0.5 text-sm font-bold text-[#FFD766]">WAIT <span className="text-xs font-semibold text-[rgba(228,244,252,.5)]">รอโอน</span></p>
              <p className="mt-1 font-mono text-xl font-bold">{kpis.flow.wait}</p>
            </div>
            <div className="rounded-xl border border-[rgba(0,230,118,.2)] bg-[#0C1520] p-3.5">
              <p className="font-mono text-[10px] font-bold text-[rgba(228,244,252,.35)]">03</p>
              <p className="mt-0.5 text-sm font-bold text-[#00E676]">DONE <span className="text-xs font-semibold text-[rgba(228,244,252,.5)]">สำเร็จ</span></p>
              <p className="mt-1 font-mono text-xl font-bold">{kpis.flow.done}</p>
            </div>
          </div>
        </div>

        {/* ── กำไรแยกห้อง (Top Rooms) ── */}
        {rooms.length > 0 && (
          <div className="reveal mt-6 rounded-2xl border border-[rgba(0,212,255,.14)] bg-[#080E18] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-[#E4F4FC]">
                🏠 กำไรแยกห้อง <span className="text-[rgba(228,244,252,.4)]">({rooms.length})</span>
              </h2>
              <span className="text-xs text-[rgba(228,244,252,.4)]">คลิกห้องเพื่อกรอง · เรียงกำไรมากสุด</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[rgba(228,244,252,.4)]">
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
                        className={`cursor-pointer border-t border-[rgba(0,212,255,.1)] transition hover:bg-[rgba(0,212,255,.05)] ${
                          active ? 'bg-[rgba(0,212,255,.07)] ring-1 ring-inset ring-[rgba(0,212,255,.28)]' : ''
                        }`}
                        title={active ? 'คลิกเพื่อดูทุกห้อง' : 'คลิกเพื่อดูเฉพาะห้องนี้'}
                      >
                        <td className="py-2 text-[rgba(228,244,252,.4)]">{i + 1}</td>
                        <td className="py-2 font-medium">
                          {active && <span className="mr-1 text-[#00D4FF]">▸</span>}
                          {r.name}
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.count}</td>
                        <td className="py-2 text-right tabular-nums">{nf.format(r.thb)}</td>
                        <td className="py-2 text-right tabular-nums">{nf.format(r.usdt)}</td>
                        <td className={`py-2 text-right font-semibold tabular-nums ${r.profit >= 0 ? 'text-[#00E676]' : 'text-[#FF5252]'}`}>
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

        {/* ── HOLDING + ตารางธุรกรรม (component เดิม) ── */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <AdminHoldings admins={admins} />
          </div>
          <div className="lg:col-span-2">
            {loading ? (
              <div className="rounded-2xl border border-[rgba(0,212,255,.14)] bg-[#080E18] p-12 text-center text-[rgba(228,244,252,.45)]">
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

        {/* ── CE COMPANION (One Mascot) ── */}
        <div className="reveal mt-6 flex flex-col items-start gap-6 rounded-2xl border border-[rgba(240,180,41,.22)] bg-[#080E18] p-6 sm:flex-row sm:items-center">
          <CEMascot expression={loading ? 'focused' : 'happy'} size={104} armL={12} armR={-20} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[.3em] text-[#F0B429]">
              CE Companion · Your Workspace Companion
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#E4F4FC]">พร้อมลุยไปด้วยกัน</h2>
            <p className="mt-1 text-sm text-[rgba(228,244,252,.55)]">
              เชื่อมระบบครบแล้วดูทุกยอดและทุกสถานะได้จากที่เดียว
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                syncOk
                  ? 'border-[rgba(0,230,118,.25)] bg-[rgba(0,230,118,.07)] text-[#00E676]'
                  : 'border-[rgba(255,109,53,.25)] bg-[rgba(255,109,53,.07)] text-[#FF6D35]'
              }`}>
                ● ฐานข้อมูล {syncOk ? 'เชื่อมต่อแล้ว' : 'กำลังตรวจ'}
                {lastSyncAt && <span className="font-mono text-[rgba(228,244,252,.4)]">{lastSyncAt}</span>}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,212,255,.22)] bg-[rgba(0,212,255,.05)] px-3 py-1 font-semibold text-[#00D4FF]">
                ● เรตตลาด {liveMarket != null ? 'LIVE' : 'ค่าล่าสุด'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(240,180,41,.28)] bg-[rgba(240,180,41,.07)] px-3 py-1 font-semibold text-[#FFD766]">
                ● อัปเดตทุก 5 วินาที
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
