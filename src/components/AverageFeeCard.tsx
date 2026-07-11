// การ์ดสรุป "Average Fee %" — เขียวเมื่ออยู่ในเกณฑ์ / แดงเมื่อเกิน threshold
interface AverageFeeCardProps {
  averageFeePercent: number;
  warningThreshold: number;
}

export default function AverageFeeCard({
  averageFeePercent,
  warningThreshold,
}: AverageFeeCardProps) {
  const isDanger = averageFeePercent > warningThreshold;

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        isDanger ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
      }`}
    >
      <p className="text-sm font-medium text-slate-500">Average Fee %</p>
      <p
        className={`mt-2 text-4xl font-bold ${
          isDanger ? 'text-red-600' : 'text-green-600'
        }`}
      >
        {averageFeePercent.toFixed(2)}%
      </p>
      <p className="mt-1 text-xs text-slate-400">
        เกณฑ์เตือน: {warningThreshold.toFixed(2)}% —{' '}
        {isDanger ? '⚠️ ค่าธรรมเนียมสูงผิดปกติ' : '✅ อยู่ในเกณฑ์ปกติ'}
      </p>
    </div>
  );
}
