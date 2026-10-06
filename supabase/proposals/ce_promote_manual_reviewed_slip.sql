-- CE VAULT manual review fallback proposal.
-- PREPARED ONLY: do not apply to production without explicit migration approval.
-- No table/column changes. Adds one service-role-only SECURITY INVOKER RPC.

create or replace function public.ce_promote_manual_reviewed_slip(
  p_pending_id uuid,
  p_admin_id uuid,
  p_bank_account_id uuid,
  p_room_name text,
  p_thb_amount numeric,
  p_bank_code text,
  p_last4 text,
  p_market_rate numeric,
  p_market_observed_at timestamptz
)
returns table(tx_id uuid, reused boolean, desk_rate numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pending public.pending_slips%rowtype;
  v_admin public.admins%rowtype;
  v_bank public.bank_accounts%rowtype;
  v_rate public.rates%rowtype;
  v_tx_id uuid;
  v_expected numeric;
  v_profit numeric;
  v_profit_percent numeric;
  v_row jsonb;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_thb_amount is null or p_thb_amount <= 0 or p_thb_amount > 10000000 then
    raise exception 'MANUAL_REVIEW_AMOUNT_INVALID';
  end if;
  if p_market_rate is null or p_market_rate <= 0 then
    raise exception 'MANUAL_REVIEW_MARKET_INVALID';
  end if;
  if p_market_observed_at is null
     or p_market_observed_at < now() - interval '60 seconds'
     or p_market_observed_at > now() + interval '5 seconds' then
    raise exception 'MANUAL_REVIEW_MARKET_STALE';
  end if;
  if p_last4 is null or p_last4 !~ '^\d{4}$' then
    raise exception 'MANUAL_REVIEW_LAST4_INVALID';
  end if;
  if nullif(trim(p_bank_code), '') is null then
    raise exception 'MANUAL_REVIEW_BANK_INVALID';
  end if;

  select * into v_pending
  from public.pending_slips
  where id = p_pending_id
  for update;

  if not found then
    raise exception 'PENDING_SLIP_NOT_FOUND';
  end if;

  if v_pending.tx_id is not null then
    return query
      select v_pending.tx_id, true, coalesce(v_pending.desk_rate, 0);
    return;
  end if;

  if v_pending.status not in ('OCR_FAILED', 'NEEDS_REVIEW') then
    raise exception 'MANUAL_REVIEW_STATE_INVALID';
  end if;

  select * into v_admin
  from public.admins
  where id = p_admin_id and coalesce(is_active, true) = true
  for update;

  if not found then
    raise exception 'ADMIN_NOT_ACTIVE';
  end if;

  select * into v_bank
  from public.bank_accounts
  where id = p_bank_account_id
  for update;

  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND';
  end if;

  if v_bank.pinned_for_date is distinct from v_today then
    raise exception 'BANK_PIN_REQUIRED';
  end if;

  if right(regexp_replace(coalesce(v_bank.account_number, ''), '\D', '', 'g'), 4) <> p_last4 then
    raise exception 'BANK_LAST4_MISMATCH';
  end if;

  select * into v_rate
  from public.rates
  where sell_rate > 0
  order by created_at desc
  limit 1
  for share;

  if not found or v_rate.sell_rate <= 0 then
    raise exception 'DESK_RATE_REQUIRED';
  end if;

  v_expected := round(p_thb_amount / v_rate.sell_rate, 6);
  v_profit := p_thb_amount - (v_expected * p_market_rate);
  v_profit_percent := case when p_thb_amount > 0 then (v_profit / p_thb_amount) * 100 else 0 end;

  v_row := jsonb_build_object(
    'admin_id', p_admin_id,
    'bank_account_id', p_bank_account_id,
    'type', 'THB_DEPOSIT',
    'thb_amount', p_thb_amount,
    'usdt_amount', v_expected,
    'sell_rate', v_rate.sell_rate,
    'buy_rate', v_rate.sell_rate,
    'cost_per_unit', p_market_rate,
    'sell_value_thb', p_thb_amount,
    'net_profit_thb', v_profit,
    'profit_percent', v_profit_percent,
    'expected_usdt', v_expected,
    'fee_usdt', 0,
    'fee_percent', 0,
    'note', v_pending.ledger_ref || '|MANUAL_REVIEW',
    'slip_image_url', null,
    'status', 'manual_reviewed',
    'admins', jsonb_build_object('name', v_admin.name),
    'chat_id', v_pending.chat_id,
    'room_name', p_room_name,
    'ocr_confidence', null,
    'receiver_name', v_pending.name,
    'receiver_bank', upper(trim(p_bank_code)),
    'receiver_last4', p_last4,
    'ledger_ref', v_pending.ledger_ref,
    'created_at', now()
  );

  select inserted.tx_id into v_tx_id
  from public.ce_insert_transaction(v_row, p_thb_amount, null) as inserted;

  update public.transactions
  set slip_fingerprint = v_pending.slip_fingerprint,
      bank_match_result = 'MANUAL_MATCH',
      expected_usdt = v_expected,
      sent_usdt = 0,
      delta_usdt = v_expected,
      is_stale_slip = false,
      updated_at = now()
  where id = v_tx_id;

  update public.pending_slips
  set tx_id = v_tx_id,
      status = 'RECORDED',
      thb_in = p_thb_amount,
      should_send = v_expected,
      bot_usd = v_expected,
      desk_rate = v_rate.sell_rate,
      mkt_rate = p_market_rate,
      bank = upper(trim(p_bank_code)),
      account_masked = '••••' || p_last4,
      pin_match = true,
      bank_account_id = p_bank_account_id,
      ocr_confidence = null,
      note = concat_ws(';', nullif(v_pending.note, ''), 'SOURCE=MANUAL_REVIEW', 'MARKET=BINANCE_TH_SPOT', 'MARKET_AT=' || p_market_observed_at::text),
      updated_at = now()
  where id = p_pending_id;

  insert into public.audit_logs (
    operator_id,
    action,
    transaction_id,
    previous_status,
    new_status,
    reason,
    metadata,
    entity_type,
    entity_id,
    actor_type,
    actor_id,
    outcome
  ) values (
    p_admin_id,
    'MANUAL_REVIEW_PROMOTED',
    v_tx_id,
    v_pending.status,
    'RECORDED',
    'OCR_UNAVAILABLE_MANUAL_REVIEW',
    jsonb_build_object(
      'ledger_ref', v_pending.ledger_ref,
      'source', 'TELEGRAM_MANUAL_REVIEW',
      'bank_account_id', p_bank_account_id,
      'market_source', 'BINANCE_TH_SPOT',
      'market_observed_at', p_market_observed_at,
      'ocr_confidence', null
    ),
    'pending_slip',
    p_pending_id::text,
    'OPERATOR',
    p_admin_id::text,
    'SUCCESS'
  );

  return query select v_tx_id, false, v_rate.sell_rate;
end;
$$;

revoke all on function public.ce_promote_manual_reviewed_slip(uuid, uuid, uuid, text, numeric, text, text, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ce_promote_manual_reviewed_slip(uuid, uuid, uuid, text, numeric, text, text, numeric, timestamptz)
  to service_role;

-- Validation after an approved apply:
-- 1) inspect function privileges and security_invoker state
-- 2) run in a disposable/test transaction for OCR_FAILED, duplicate, stale market, wrong PIN
-- 3) verify no row is created on any rejected case
-- 4) verify successful path creates one transaction + one audit event and leaves ocr_confidence NULL
