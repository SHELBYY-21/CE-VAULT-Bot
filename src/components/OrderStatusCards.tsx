import { ORDER_STATUSES } from '@/lib/orderStatus';
import type { OrderStatus } from '@/types/transactions';

type OrderRow = {
  id: string;
  status: OrderStatus | null;
  thb_amount: number;
  usdt_amount: number;
  slip_image_url: string | null;
  note: string | null;
  admins?: { name: string | null } | null;
};

const TEXT: Record<OrderStatus, { title: string; subtitle: string; badge: string; detail: string }> = {
  ocr_success: {
    title: '✅ OCR สำเร็จ',
    subtitle: 'สลิปจริง ข้อมูลถูกต้อง',
    badge: '🔍 กำลังตรวจสอบสลิป...',
    detail: 'ระบบตรวจสอบ OCR ผ่านแล้ว กำลังเตรียมส่งต่อให้แอดมินดำเนินการ',
  },
  waiting_admin: {
    title: '⏳ รอแอดมินส่ง USDT',
    subtitle: 'โดยปกติใช้เวลาไม่เกิน 15 นาที',
    badge: 'รอแอดมินดำเนินการ',
    detail: 'หากเกิน 15 นาที กรุณาโทรหาแอดมินทันที',
  },
  completed: {
    title: '🎉 ส่ง USDT สำเร็จ',
    subtitle: 'แอดมินดำเนินการเรียบร้อยแล้ว',
    badge: 'รายการเสร็จสมบูรณ์',
    detail: 'ธุรกรรมนี้เสร็จสมบูรณ์แล้ว',
  },
};

function stepClass(active: boolean) {
  return active
    ? 'border-indigo-400/50 bg-indigo-500/15 text-white'
    : 'border-[color:var(--border)] bg-white/5 text-[color:var(--muted)]';
}

function cardClass(status: OrderStatus) {
  if (status === 'completed') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'waiting_admin') return 'border-amber-400/20 bg-amber-500/10 text-amber-100';
  return 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100';
}

export default function OrderStatusCards({ row }: { row: OrderRow }) {
  const status = row.status ?? 'waiting_admin';
  const text = TEXT[status];
  const adminName = row.admins?.name ?? '-';

  return (
    <div className="glass accent-top overflow-hidden p-5">
      <div className="mb-4 grid grid-cols-3 gap-2">
        {ORDER_STATUSES.map((s) => (
          <div key={s} className={`rounded-xl border px-3 py-2 text-center text-[11px] font-semibold ${stepClass(s === status)}`}>
            {s === 'ocr_success' ? 'OCR' : s === 'waiting_admin' ? 'WAIT' : 'SUCCESS'}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-white/5 p-4">
        <div className="text-center">
          <div className="text-sm font-semibold text-[color:var(--muted)]">{text.badge}</div>
          <div className="mt-3 text-2xl font-bold">{text.title}</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">{text.subtitle}</div>
        </div>

        <div className={`mt-4 rounded-xl border p-4 text-sm ${cardClass(status)}`}>{text.detail}</div>

        <div className="mt-4 grid gap-2 text-sm text-[color:var(--muted)]">
          <div className="flex justify-between gap-4">
            <span>แอดมิน</span>
            <span className="text-white">{adminName}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>THB</span>
            <span className="text-white">{Number(row.thb_amount).toLocaleString('th-TH')} ฿</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>USDT</span>
            <span className="text-white">{Number(row.usdt_amount).toLocaleString('th-TH')} USDT</span>
          </div>
        </div>
      </div>

      {row.slip_image_url && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.slip_image_url} alt="slip" className="h-80 w-full rounded-xl object-contain" />
        </div>
      )}

      {row.note && (
        <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-white/5 p-4 text-sm text-[color:var(--muted)]">
          {row.note}
        </div>
      )}
    </div>
  );
}
