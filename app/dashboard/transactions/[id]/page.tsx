import TransactionDetail from '@/components/TransactionDetail';

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransactionDetail id={id} />;
}
