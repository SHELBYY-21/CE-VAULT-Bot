import type { OrderStatus } from '@/types/transactions';

export const ORDER_STATUSES = ['ocr_success', 'waiting_admin', 'completed'] as const satisfies readonly OrderStatus[];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}
