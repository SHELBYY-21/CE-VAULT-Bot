'use client';

import { useRouter } from 'next/navigation';
import type { Transaction } from '@/types/transactions';
import TransactionActions from '@/components/TransactionActions';

/** Client wrapper for edit / complete / delete on the server-rendered detail page */
export default function TransactionDetailActions({ transaction }: { transaction: Transaction }) {
  const router = useRouter();

  return (
    <TransactionActions
      transaction={transaction}
      layout="stack"
      showDetailLink={false}
      onChanged={() => router.refresh()}
      onDeleted={() => router.push('/dashboard')}
    />
  );
}
