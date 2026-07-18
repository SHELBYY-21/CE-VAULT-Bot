import { supabaseAdmin } from './supabaseAdmin';
import type { OrderStatus } from '@/types/transactions';

export async function updateTransactionStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabaseAdmin
    .from('transactions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}
