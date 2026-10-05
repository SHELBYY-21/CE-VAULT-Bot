-- CE VAULT live Telegram/OCR intake hardening.
-- Non-destructive: adds idempotency indexes and one server-only promotion RPC.

create unique index if not exists pending_slips_slip_fingerprint_uq
  on public.pending_slips (slip_fingerprint)
  where slip_fingerprint is not null;

create unique index if not exists transactions_slip_fingerprint_uq
  on public.transactions (slip_fingerprint)
  where slip_fingerprint is not null;

create or replace function public.ce_promote_pending_slip(
  p_pending_id uuid,
  p_admin_id uuid,
  p_room_name text default null
)
returns table(tx_id uuid, reused boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pending public.pending_slips%rowtype;
  v_admin public.admins%rowtype;
  v_tx_id uuid;
  v_expected numeric;
  v_profit numeric;
  v_profit_percent numeric;
  v_row jsonb;
begin
  select * into v_pending
    from public.pending_slips
    where id = p_pending_id
    for update;

  if not found then
    raise exception 'PENDING_SLIP_NOT_FOUND';
  end if;

  if v_pending.tx_id is not null then
    return query select v_pending.tx_id, true;
    return;
  end if;

  select * into v_admin
    from public.admins
    where id = p_admin_id and coalesce(is_active, true) = true
    for update;

  if not found then
    raise exception 'ADMIN_NOT_ACTIVE';
  end if;

  if v_pending.status <> 'VERIFIED' then
    raise exception 'PENDING_SLIP_NOT_VERIFIED';
  end if;
  if coalesce(v_pending.pin_match, false) <> true or v_pending.bank_account_id is null then
    raise exception 'BANK_PIN_MATCH_REQUIRED';
  end if;
  if coalesce(v_pending.ocr_confidence, 0) < 90 then
    raise exception 'OCR_CONFIDENCE_TOO_LOW';
  end if;
  if coalesce(v_pending.thb_in, 0) <= 0 then
    raise exception 'THB_AMOUNT_INVALID';
  end if;
  if coalesce(v_pending.desk_rate, 0) <= 0 then
    raise exception 'DESK_RATE_REQUIRED';
  end if;
  if coalesce(v_pending.mkt_rate, 0) <= 0 then
    raise exception 'MARKET_RATE_REQUIRED';
  end if;

  v_expected := round(v_pending.thb_in / v_pending.desk_rate, 6);
  v_profit := v_pending.thb_in - (v_expected * v_pending.mkt_rate);
  v_profit_percent := case when v_pending.thb_in > 0 then (v_profit / v_pending.thb_in) * 100 else 0 end;

  v_row := jsonb_build_object(
    'admin_id', p_admin_id,
    'bank_account_id', v_pending.bank_account_id,
    'type', 'THB_DEPOSIT',
    'thb_amount', v_pending.thb_in,
    'usdt_amount', v_expected,
    'sell_rate', v_pending.desk_rate,
    'buy_rate', v_pending.desk_rate,
    'cost_per_unit', v_pending.mkt_rate,
    'sell_value_thb', v_pending.thb_in,
    'net_profit_thb', v_profit,
    'profit_percent', v_profit_percent,
    'expected_usdt', v_expected,
    'fee_usdt', 0,
    'fee_percent', 0,
    'note', v_pending.ledger_ref,
    'slip_image_url', null,
    'status', 'ocr_success',
    'admins', jsonb_build_object('name', v_admin.name),
    'chat_id', v_pending.chat_id,
    'room_name', p_room_name,
    'ocr_confidence', v_pending.ocr_confidence,
    'receiver_name', v_pending.name,
    'receiver_bank', v_pending.bank,
    'receiver_last4', right(regexp_replace(coalesce(v_pending.account_masked, ''), '\D', '', 'g'), 4),
    'ledger_ref', v_pending.ledger_ref,
    'created_at', now()
  );

  select inserted.tx_id into v_tx_id
    from public.ce_insert_transaction(v_row, v_pending.thb_in, null) as inserted;

  update public.transactions
    set slip_fingerprint = v_pending.slip_fingerprint,
        bank_match_result = 'MATCH',
        expected_usdt = v_expected,
        sent_usdt = 0,
        delta_usdt = v_expected,
        is_stale_slip = false,
        updated_at = now()
    where id = v_tx_id;

  update public.pending_slips
    set tx_id = v_tx_id,
        status = 'RECORDED',
        should_send = v_expected,
        bot_usd = v_expected,
        updated_at = now()
    where id = p_pending_id;

  return query select v_tx_id, false;
end;
$$;

revoke execute on function public.ce_promote_pending_slip(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ce_promote_pending_slip(uuid, uuid, text) to service_role;
