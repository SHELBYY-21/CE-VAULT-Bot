// การ์ดสถานะ: OCR ตรวจสลิปสำเร็จ (step 1/3)
export default function OCRSuccessCard() {
  return (
    <div className="glass p-8 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 text-4xl shadow-[0_0_30px_rgba(0,230,118,0.25)]">
        🔍
      </div>
      <p className="text-sm text-[color:var(--muted)]">กำลังตรวจสอบสลิป...</p>
      <h2 className="mt-2 text-2xl font-bold text-emerald-300">✅ OCR สำเร็จ</h2>
      <p className="mt-3 text-[color:var(--muted)]">สลิปจริง ข้อมูลถูกต้อง</p>
    </div>
  );
}
