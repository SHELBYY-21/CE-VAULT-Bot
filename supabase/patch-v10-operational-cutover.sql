-- ============================================================
-- CE VAULT patch v10 — operational cutover to Supabase (fresh start)
-- paste ใน Supabase SQL Editor > Run (idempotent)
-- ต้องรันหลัง schema.sql + patch v2..v9 บนโปรเจกต์ iuaaviivkumvzbdmpzty
-- ============================================================

-- 1) transactions.admins — denormalized staff snapshot (compat กับรูปแบบ Firestore เดิม)
alter table public.transactions add column if not exists admins jsonb;

-- 2) USDT precision: OCR/tolerance 0.0001 ต้องเก็บเกิน 2 จุดทศนิยม
alter table public.transactions alter column usdt_amount    type numeric(24,6);
alter table public.transactions alter column expected_usdt type numeric(24,6);
alter table public.transactions alter column fee_usdt      type numeric(24,6);
alter table public.admins       alter column holding_usdt  type numeric(24,6);

-- 3) RPC atomic — แทรกธุรกรรม + ยอดบัญชีธนาคาร + เหรียญตกค้างแอดมิน ใน Postgres transaction เดียว
create or replace function public.ce_insert_transaction(
  p_row jsonb,
  p_bank_delta numeric default null,
  p_holding_delta numeric default null
) returns table (tx_id uuid, admin_holding numeric)
language plpgsql as $$
declare
  v_id uuid;
  v_admin_id uuid;
  v_bank_id uuid;
  v_holding numeric;
begin
  if p_row->>'type' is null then
    raise exception 'ce_insert_transaction: type required';
  end if;
  v_admin_id := (p_row->>'admin_id')::uuid;
  if v_admin_id is null then
    raise exception 'ce_insert_transaction: admin_id required';
  end if;

  -- serialize concurrent financial writes for this admin
  perform 1 from public.admins where id = v_admin_id for update;

  insert into public.transactions (
    admin_id, bank_account_id, type, thb_amount, usdt_amount, sell_rate,
    cost_per_unit, sell_value_thb, net_profit_thb, profit_percent,
    expected_usdt, fee_usdt, fee_percent, note, slip_image_url, status,
    admins, chat_id, buy_rate, room_name, ocr_confidence,
    usdt_network, usdt_txid, usdt_image_url,
    receiver_name, receiver_bank, receiver_last4, ledger_ref, receiver_id,
    created_at, updated_at
  ) values (
    v_admin_id,
    nullif(p_row->>'bank_account_id', '')::uuid,
    p_row->>'type',
    coalesce(nullif(p_row->>'thb_amount', '')::numeric, 0),
    coalesce(nullif(p_row->>'usdt_amount', '')::numeric, 0),
    coalesce(nullif(p_row->>'sell_rate', '')::numeric, 0),
    coalesce(nullif(p_row->>'cost_per_unit', '')::numeric, 0),
    coalesce(nullif(p_row->>'sell_value_thb', '')::numeric, 0),
    coalesce(nullif(p_row->>'net_profit_thb', '')::numeric, 0),
    coalesce(nullif(p_row->>'profit_percent', '')::numeric, 0),
    coalesce(nullif(p_row->>'expected_usdt', '')::numeric, 0),
    coalesce(nullif(p_row->>'fee_usdt', '')::numeric, 0),
    coalesce(nullif(p_row->>'fee_percent', '')::numeric, 0),
    p_row->>'note',
    p_row->>'slip_image_url',
    coalesce(p_row->>'status', 'waiting_admin'),
    p_row->'admins',
    nullif(p_row->>'chat_id', '')::bigint,
    nullif(p_row->>'buy_rate', '')::numeric,
    p_row->>'room_name',
    nullif(p_row->>'ocr_confidence', '')::numeric,
    p_row->>'usdt_network',
    p_row->>'usdt_txid',
    p_row->>'usdt_image_url',
    p_row->>'receiver_name',
    p_row->>'receiver_bank',
    p_row->>'receiver_last4',
    p_row->>'ledger_ref',
    nullif(p_row->>'receiver_id', '')::uuid,
    coalesce(nullif(p_row->>'created_at', '')::timestamptz, now()),
    now()
  ) returning id into v_id;

  v_bank_id := nullif(p_row->>'bank_account_id', '')::uuid;
  if v_bank_id is not null and coalesce(p_bank_delta, 0) <> 0 then
    update public.bank_accounts
      set current_balance = current_balance + p_bank_delta, updated_at = now()
      where id = v_bank_id;
  end if;

  if coalesce(p_holding_delta, 0) <> 0 then
    update public.admins
      set holding_usdt = holding_usdt + p_holding_delta, updated_at = now()
      where id = v_admin_id
      returning holding_usdt into v_holding;
  else
    select holding_usdt into v_holding from public.admins where id = v_admin_id;
  end if;

  return query select v_id, v_holding;
end;
$$;

-- แก้ธุรกรรม: อัปเดตยอด + ปรับ holding/bank จากแถวที่ถูกล็อก (ไม่มี TOCTOU)
create or replace function public.ce_edit_transaction(
  p_tx_id uuid,
  p_patch jsonb
) returns table (tx jsonb, admin_holding numeric)
language plpgsql as $$
declare
  v_old record;
  v_new_thb numeric;
  v_new_usdt numeric;
  v_delta numeric;
  v_holding numeric;
begin
  select * into v_old from public.transactions where id = p_tx_id for update;
  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_new_thb := coalesce(nullif(p_patch->>'thb_amount', '')::numeric, v_old.thb_amount);
  v_new_usdt := coalesce(nullif(p_patch->>'usdt_amount', '')::numeric, v_old.usdt_amount);

  update public.transactions set
    thb_amount = v_new_thb,
    usdt_amount = v_new_usdt,
    sell_rate = coalesce(nullif(p_patch->>'sell_rate', '')::numeric, sell_rate),
    cost_per_unit = coalesce(nullif(p_patch->>'cost_per_unit', '')::numeric, cost_per_unit),
    sell_value_thb = coalesce(nullif(p_patch->>'sell_value_thb', '')::numeric, sell_value_thb),
    net_profit_thb = coalesce(nullif(p_patch->>'net_profit_thb', '')::numeric, net_profit_thb),
    profit_percent = coalesce(nullif(p_patch->>'profit_percent', '')::numeric, profit_percent),
    expected_usdt = coalesce(nullif(p_patch->>'expected_usdt', '')::numeric, expected_usdt),
    fee_usdt = coalesce(nullif(p_patch->>'fee_usdt', '')::numeric, fee_usdt),
    fee_percent = coalesce(nullif(p_patch->>'fee_percent', '')::numeric, fee_percent),
    updated_at = now()
  where id = p_tx_id;

  if v_old.type = 'THB_DEPOSIT' then
    v_delta := v_new_usdt - v_old.usdt_amount;
    if v_old.bank_account_id is not null and v_new_thb <> v_old.thb_amount then
      update public.bank_accounts
        set current_balance = current_balance + (v_new_thb - v_old.thb_amount), updated_at = now()
        where id = v_old.bank_account_id;
    end if;
  else
    v_delta := -(v_new_usdt - v_old.usdt_amount);
  end if;

  update public.admins
    set holding_usdt = holding_usdt + v_delta, updated_at = now()
    where id = v_old.admin_id
    returning holding_usdt into v_holding;

  return query select to_jsonb(t), v_holding from public.transactions t where t.id = p_tx_id;
end;
$$;

-- ลบธุรกรรม: คืนยอด holding/bank พร้อมลบแถวใน transaction เดียว
create or replace function public.ce_delete_transaction(p_tx_id uuid)
returns table (tx jsonb, admin_holding numeric)
language plpgsql as $$
declare
  v_old record;
  v_delta numeric;
  v_holding numeric;
begin
  delete from public.transactions where id = p_tx_id returning * into v_old;
  if not found then
    raise exception 'TX_NOT_FOUND';
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

-- 4) ปิด execute ของทุก function ใน public จากบทบาทสาธารณะ (service-role เท่านั้น)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant execute on all functions in schema public to service_role;

-- ตรวจสอบ (ไม่คืนข้อมูลการเงิน)
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ce_insert_transaction', 'ce_edit_transaction', 'ce_delete_transaction');
