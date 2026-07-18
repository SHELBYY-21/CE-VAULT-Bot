'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isOrderStatus } from '@/lib/orderStatus';
import type { OrderStatus } from '@/types/transactions';
import OrderStatusCards from './OrderStatusCards';

type AdminRef = { name: string | null };

type OrderRow = {
  id: string;
  status: OrderStatus | null;
  thb_amount: number;
  usdt_amount: number;
  slip_image_url: string | null;
  note: string | null;
  admins?: AdminRef | null;
};

type OrderPayload = Omit<OrderRow, 'admins' | 'status'> & {
  status?: OrderStatus | string | null;
  admins?: AdminRef | AdminRef[] | null;
};

function normalizeOrder(row: Partial<OrderPayload> | null): OrderRow | null {
  if (!row?.id) return null;
  const { admins, status, ...order } = row;

  return {
    id: row.id,
    thb_amount: Number(order.thb_amount ?? 0),
    usdt_amount: Number(order.usdt_amount ?? 0),
    slip_image_url: order.slip_image_url ?? null,
    note: order.note ?? null,
    status: isOrderStatus(status) ? status : 'waiting_admin',
    admins: Array.isArray(admins) ? admins[0] ?? null : admins ?? null,
  };
}

export default function OrderStatusRealtime({ id }: { id: string }) {
  const [row, setRow] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('transactions')
        .select('id,status,thb_amount,usdt_amount,slip_image_url,note, admins(name)')
        .eq('id', id)
        .single();

      if (!cancelled) {
        setRow(normalizeOrder((data as OrderPayload) ?? null));
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`order-status-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as Partial<OrderPayload>;
          setRow((prev) => normalizeOrder({ ...(prev ?? {}), ...next }));
          setLoading(false);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="glass accent-top w-full p-6 text-center">
        <div className="text-sm text-[color:var(--muted)]">กำลังโหลดสถานะ...</div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="glass accent-top w-full p-6 text-center">
        <div className="text-sm text-[color:var(--muted)]">ไม่พบรายการนี้</div>
      </div>
    );
  }

  return <OrderStatusCards row={row} />;
}
