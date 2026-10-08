-- CE VAULT: atomic DELETE guard. Apply only after independent review and approval.
-- Recorded/OCR/pending/unknown status must never be removed, including via direct RPC.
-- Retain existing balance adjustments and the single Postgres transaction.
create or replace function public.ce_delete_transaction(p_tx_id uuid)
returns table (tx jsonb, admin_holding numeric)
language plpgsql as $$
declare
  v_old record;
  v_delta numeric;
  v_holding numeric;
begin
  -- Atomic status predicate prevents a status change between read and delete.
  delete from public.transactions
    where id = p_tx_id and status = 'completed'
    returning * into v_old;
  if not found then
    raise exception 'TX_NOT_FOUND_OR_NOT_SETTLED';
  end if;

  if v_old.type = 'THB_DEPOSIT' then
    v_delta := -v_old.usdt_amount;
    if v_old.bank_account_id is not null then
      update public.bank_accounts
        set current_balance = current_balance - v_old.thb_amount, updated_at = now()
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

revoke execute on function public.ce_delete_transaction(uuid) from public, anon, authenticated;
grant execute on function public.ce_delete_transaction(uuid) to service_role;
