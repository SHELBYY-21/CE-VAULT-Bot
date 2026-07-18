// หน้า Transaction Detail — dark glass (ธีม CE Vault)
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import MarkCompletedButton from '@/components/MarkCompletedButton';
import type { Transaction } from '@/types/transactions';

const FEE_WARNING_THRESHOLD = 3;

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from('transactions')
    .select('*, admins(name)')
    .eq('id', id)
    .single();

  const t = data as Transaction | null;

  if (!t) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="glass p-8 text-center">
          <p className="text-[color:var(--muted)]">ไม่พบธุรกรรมนี้</p>
          <Link href="/dashboard" className="mt-2 inline-block text-indigo-300 hover:underline">
            ← กลับหน้าแดชบอร์ด
          </Link>
        </div>
      </main>
    );
  }

  const isDanger = Number(t.fee_percent) > FEE_WARNING_THRESHOLD;
  const isDeposit = t.type === 'THB_DEPOSIT';
  const status = t.status ?? 'waiting_admin';

  const statusLabel =
    status === 'ocr_success'
      ? 'OCR สำเร็จ'
      : status === 'waiting_admin'
        ? 'รอแอดมิน'
        : 'ส่ง USDT สำเร็จ';

  const statusClass =
    status === 'ocr_success'
      ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/25'
      : status === 'waiting_admin'
        ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/25'
        : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25';

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="reveal text-sm text-[color:var(--muted)] transition hover:text-white"
      >
        ← กลับหน้าแดชบอร์ด
      </Link>

      <h1 className="reveal mt-3 flex items-center gap-2.5 text-2xl font-bold tracking-tight">
        <span className="gradient-text">รายละเอียดธุรกรรม</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isDeposit
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25'
              : 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25'
          }`}
        >
          {isDeposit ? '↓ ฝาก THB → USDT' : '↑ ส่งออก USDT'}
        </span>
      </h1>
      <p className="reveal text-xs text-[color:var(--muted)]">{t.id}</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div
          className="glass accent-top reveal space-y-3 p-6"
          style={{ animationDelay: '80ms' }}
        >
          <Row label="แอดมิน" value={t.admins?.name ?? '-'} strong />
          <Row label="เวลา" value={new Date(t.created_at).toLocaleString('th-TH')} />
          <Row label="ยอด THB" value={`${Number(t.thb_amount).toLocaleString('th-TH')} ฿`} />
          <Row label="ยอด USDT" value={`${Number(t.usdt_amount).toLocaleString('th-TH')} USDT`} />
          <Row label="เรตขาย" value={String(t.sell_rate)} />
          <Row
            label="กำไรสุทธิ"
            value={`${Number(t.net_profit_thb).toFixed(2)} ฿ (${Number(t.profit_percent).toFixed(2)}%)`}
            tone={Number(t.net_profit_thb) >= 0 ? 'good' : 'bad'}
          />
          <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-3">
            <span className="text-[color:var(--muted)]">ค่าธรรมเนียม</span>
            <span
              className={`rounded-lg px-2 py-0.5 text-sm font-semibold ${
                isDanger ? 'bg-rose-500/15 text-rose-300' : 'text-white'
              }`}
            >
              {Number(t.fee_usdt).toFixed(2)} USDT ({Number(t.fee_percent).toFixed(2)}%)
            </span>
          </div>
          <Row label="หมายเหตุ" value={t.note ?? '-'} />
          <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-3">
            <span className="text-[color:var(--muted)]">สถานะ</span>
            <span className={`rounded-lg px-2 py-0.5 text-sm font-semibold ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          <div className="pt-2">
            <MarkCompletedButton id={t.id} currentStatus={t.status} />
          </div>
        </div>

        <div className="glass reveal p-4" style={{ animationDelay: '160ms' }}>
          <p className="mb-2 text-sm font-medium text-[color:var(--muted)]">สลิป</p>
          {t.slip_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.slip_image_url}
              alt="slip"
              className="h-96 w-full rounded-xl bg-black/30 object-contain ring-1 ring-[color:var(--border)]"
            />
          ) : (
            <p className="grid h-96 place-items-center text-[color:var(--muted)]">ไม่มีภาพสลิป</p>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'good' | 'bad';
}) {
  const toneCls = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-white';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span className={`${strong ? 'font-semibold' : 'font-medium'} ${toneCls}`}>{value}</span>
    </div>
  );
}
