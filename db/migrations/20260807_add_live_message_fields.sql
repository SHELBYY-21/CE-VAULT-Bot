-- 2026-08-07: Add live-message support and audit log
-- Idempotent migration for review. DO NOT APPLY TO PRODUCTION until a DB backup is taken.

BEGIN;

-- Add live message and audit columns to transactions (safe with IF NOT EXISTS)
ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS live_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS live_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS live_status TEXT,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure admins have a role column (default Operator). If you prefer ENUM, migrate later.
ALTER TABLE IF EXISTS admins
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Operator';

-- Create a transaction status logs table for audit/history of live-message state changes
CREATE TABLE IF NOT EXISTS transaction_status_logs (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  metadata JSONB,
  created_at timestamptz DEFAULT now()
);

-- Indexes to speed up lookups by live message and chat
CREATE INDEX IF NOT EXISTS idx_transactions_live_message_id ON transactions (live_message_id);
CREATE INDEX IF NOT EXISTS idx_transactions_live_chat_id ON transactions (live_chat_id);
CREATE INDEX IF NOT EXISTS idx_transaction_status_logs_txid ON transaction_status_logs (transaction_id);

COMMIT;

-- NOTES:
-- 1) This migration is intentionally simple and idempotent (uses IF NOT EXISTS) so it can be reviewed/applied safely.
-- 2) Before applying to production: take a full DB backup and test on staging.
-- 3) If your transactions.id is not UUID, adjust the FOREIGN KEY type accordingly.
-- 4) Consider adding NOT NULL constraints or ENUM types after verifying running traffic.
