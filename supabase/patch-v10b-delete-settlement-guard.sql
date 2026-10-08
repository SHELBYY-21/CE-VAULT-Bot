-- CE VAULT: only a fully completed Ledger transaction can be deleted.
-- Apply in Supabase AFTER review and before relying on the application guard.
-- Replaces only the existing service-role RPC; does not enable live settlement.
-- The locked row is the authoritative status, preventing a read/delete race.

create or replace function public.ce_delete_transaction(p_tx_id uuid)
returns table (tx jsonb, admin_holding numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $
declare
  v_old public.transactions%rowtype;
  v_delta numeric;
  v_holding numeric;
begin
  select * into v_old from public.transactions where id = p_tx_id for update;
  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  -- Fail closed for OCR_SUCCESS, WAITING_ADMIN, NULL and unknown statuses.
  if v_old.status is distinct from 'completed' then
    raise exception 'TX_NOT_SETTLED';
  end if;

  delete from public.transactions where id = p_tx_id;
  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  if v_old.type = 'THB_DEPOSIT' then
    v_delta := -v_old.usdt_amount;
    if v_old.bank_account_id is not null then
      update public.bank_accounts
        set current_balance = current_balance - v_old.thb_amount,
            updated_at = now()
        where id = v_old.bank_account_id;
    end if;
  else
    v_delta := v_old.usdt_amount;
  end if;

  update public.admins
    set holding_usdt = holding_usdt + v_delta, updated_at = now()
    where id = v_old.admin_id
    returning holding_usdt into v_holding;

  return query select to_jsonb(v_old), v_holding;
end;
$$;

-- Preserve the financial RPC boundary: service role only.
revoke execute on function public.ce_delete_transaction(uuid) from public, anon, authenticated;
grant execute on function public.ce_delete_transaction(uuid) to service_role;
