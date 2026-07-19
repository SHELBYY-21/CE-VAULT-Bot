// หน้าสถานะดีลสำหรับลูกค้า (public) — แสดงเฉพาะสถานะ ไม่เปิดเผยข้อมูลภายใน (กำไร/ค่าธรรมเนียม)
// ที่มา status:
//   1) transactions.status ถ้ามีค่าใน 3 สถานะ
//   2) ธุรกรรมมีอยู่ในตาราง = completed (บอทบันทึกตอนจบดีล)
//   3) ?s=ocr_success|waiting_admin|completed สำหรับพรีวิว UI (เมื่อยังไม่พบธุรกรรม)
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import StatusSwitcher, { type DealStatus } from '@/components/status/StatusSwitcher';

const VALID: DealStatus[] = ['ocr_success', 'waiting_admin', 'completed'];

function asStatus(v: unknown): DealStatus | null {
  return VALID.includes(v as DealStatus) ? (v as DealStatus) : null;
}

export default async function StatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const [{ id }, { s }] = await Promise.all([params, searchParams]);

  const { data: t } = await supabaseAdmin
    .from('transactions')
    .select('id, usdt_amount, created_at')
    .eq('id', id)
    .maybeSingle();

  // มีธุรกรรม = ดีลจบแล้ว (แถวถูก insert ตอน finalizeDeal) — เว้นแต่ DB จะมี status ระบุขั้นก่อนหน้า
  const status: DealStatus | null = t
    ? (asStatus((t as { status?: string }).status) ?? 'completed')
    : asStatus(s);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-xl shadow-[0_0_20px_rgba(0,230,118,0.4)]">
          🤖
        </div>
        <h1 className="text-lg font-extrabold tracking-widest">
          CE <span className="text-emerald-300">VAULT</span>
        </h1>
        <p className="text-[11px] tracking-[0.2em] text-[color:var(--muted)]">
          สถานะรายการ (ORDER STATUS)
        </p>
      </header>

      {status ? (
        <StatusSwitcher status={status} usdt={t ? Number(t.usdt_amount) : null} />
      ) : (
        <div className="glass p-8 text-center">
          <p className="text-[color:var(--muted)]">ไม่พบรายการนี้</p>
          <p className="mt-2 text-xs text-[color:var(--muted)]">
            หากเพิ่งส่งสลิป กรุณารอสักครู่แล้วรีเฟรชอีกครั้ง
          </p>
        </div>
      )}

      <footer className="mt-8 text-center text-[10px] tracking-[0.15em] text-[color:var(--muted)]">
        ⬢ CE VAULT · SECURE · FAST · TRUSTED · 24/7
      </footer>
    </main>
  );
}
