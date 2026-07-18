-- ============================================================
-- CE VAULT — Patch v8: transaction status flow
-- เพิ่มสถานะรายการสำหรับหน้า customer status + ปุ่มแอดมิน mark completed
-- ============================================================

alter table public.transactions
  add column if not exists status text not null default 'waiting_admin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_status_check
      check (status in ('ocr_success', 'waiting_admin', 'completed'));
  end if;
end $$;

create index if not exists idx_tx_status_created
  on public.transactions (status, created_at desc);
