// การ์ดสถานะ: รอแอดมินส่ง USDT (step 2/3)
export default function WaitingAdminCard() {
  return (
    <div className="glass p-8 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 animate-pulse items-center justify-center rounded-full border-2 border-amber-400/60 bg-amber-500/10 text-4xl shadow-[0_0_30px_rgba(245,200,66,0.25)]">
        ⏳
      </div>
      <h2 className="text-2xl font-bold text-amber-300">รอแอดมินส่ง USDT</h2>
      <p className="mt-3 text-[color:var(--muted)]">โดยปกติใช้เวลาไม่เกิน 15 นาที</p>
      <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
        หากเกิน 15 นาที กรุณาโทรหาแอดมินทันที
      </p>
    </div>
  );
}
