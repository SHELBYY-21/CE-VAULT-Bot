import OrderStatusRealtime from '@/components/OrderStatusRealtime';

export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <div className="mb-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300">CE Vault</div>
        <div className="mt-1 text-xs text-[color:var(--muted)]">รายการ {id}</div>
      </div>
      <OrderStatusRealtime id={id} />
    </main>
  );
}
