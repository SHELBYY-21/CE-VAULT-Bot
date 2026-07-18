import TransactionDetail from '@/components/TransactionDetail';

export default async function TransactionAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransactionDetail id={id} />;
}
