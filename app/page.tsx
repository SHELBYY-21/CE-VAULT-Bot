import OrderLookupForm from '@/components/OrderLookupForm';
import OrderStatusRealtime from '@/components/OrderStatusRealtime';

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <div className="mb-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300">CE Vault</div>
        <h1 className="mt-2 text-2xl font-bold text-white">ติดตามสถานะรายการ</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">การ์ดจะเปลี่ยนทันทีเมื่อ Bot หรือแอดมินอัปเดต status</p>
      </div>

      {id ? <OrderStatusRealtime id={id} /> : <OrderLookupForm />}
    </main>
  );
}
