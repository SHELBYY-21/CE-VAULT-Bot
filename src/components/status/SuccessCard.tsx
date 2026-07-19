// การ์ดสถานะ: ส่ง USDT สำเร็จ (step 3/3)
export default function SuccessCard({ usdt }: { usdt?: number | null }) {
  return (
    <div className="glass p-8 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/70 bg-emerald-500/10 text-4xl shadow-[0_0_36px_rgba(0,230,118,0.35)]">
        🎉
      </div>
      <h2 className="text-2xl font-bold text-emerald-300">ส่ง USDT สำเร็จ</h2>
      <p className="mt-3 text-[color:var(--muted)]">แอดมินดำเนินการเรียบร้อยแล้ว</p>
      {typeof usdt === 'number' && usdt > 0 && (
        <p className="mt-5 text-3xl font-extrabold tracking-tight text-white">
          {usdt.toLocaleString('th-TH')}{' '}
          <span className="text-lg font-semibold text-cyan-300">USDT</span>
        </p>
      )}
    </div>
  );
}
