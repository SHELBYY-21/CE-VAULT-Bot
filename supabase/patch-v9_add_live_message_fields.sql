-- Patch v9: add live message support, admin.role, and status logs
-- Created: 2026-08-07
-- NOTE: Idempotent; run only after database backup. This file is for review and manual apply.

-- 1) add role to admins (SuperAdmin / Admin / Operator / Viewer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.admins ADD COLUMN role TEXT DEFAULT 'Operator';
  END IF;
END$$;

-- 2) transactions: live message fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'live_message_id'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN live_message_id BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'live_chat_id'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN live_chat_id BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'live_status'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN live_status TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END$$;

-- 3) transaction_status_logs audit table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaction_status_logs'
  ) THEN
    CREATE TABLE public.transaction_status_logs (
      id BIGSERIAL PRIMARY KEY,
      transaction_id UUID NOT NULL,
      status TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_transaction_status_logs_transaction_id ON public.transaction_status_logs (transaction_id);
  END IF;
END$$;

-- 4) indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_transactions_live_message_id' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_transactions_live_message_id ON public.transactions (live_message_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_transactions_live_chat_id' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_transactions_live_chat_id ON public.transactions (live_chat_id);
  END IF;
END$$;

-- End of patch
