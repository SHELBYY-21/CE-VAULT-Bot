Migration apply checklist — db/migrations/20260807_add_live_message_fields.sql

WARNING: Do NOT apply to production without a verified backup and staging validation.

Pre-apply (required)
1. Take a full logical backup of the target database (pg_dump for Postgres).
   Example:
     pg_dump -Fc -h host -U user -d dbname -f ce_vault_backup_$(date +%F).dump
2. Verify backup integrity (attempt a restore to a local/staging instance or at least inspect dump file size).
3. Ensure you have a staging database with the same schema and recent data snapshot.
4. Confirm you have psql available on the host where you'll run the migration.

Staging apply (recommended flow)
1. Export STAGING_DATABASE_URL or set it in your environment:
     export STAGING_DATABASE_URL='postgres://user:pass@host:5432/db'
   On Windows PowerShell:
     $env:STAGING_DATABASE_URL = 'postgres://user:pass@host:5432/db'
2. Run the migration against staging (the script is added in package.json as migrate:staging):
     npm run migrate:staging
   Or run directly:
     psql "$STAGING_DATABASE_URL" -f db/migrations/20260807_add_live_message_fields.sql
3. Verify:
   - transactions table now has columns: live_message_id, live_chat_id, live_status, updated_at
   - admins.role exists and defaults to 'Operator'
   - transaction_status_logs table exists
   - indexes created
4. Run integration smoke tests against staging flows (receive slip → create live message → update live message → complete).

Production apply (only after staging verified)
1. Schedule a maintenance window if required by policy.
2. Take an immediate pre-apply backup as above.
3. Apply migration using the same command but pointing STAGING_DATABASE_URL to production DB (do NOT call it staging then).
4. Monitor application logs for errors. The LiveMessageService is best-effort — failures to write live fields should be logged but non-fatal.

Rollback
- If anything goes wrong, restore from the backup created before apply.
- Because this migration is additive and idempotent, rolling back requires restoring the previous DB snapshot to remove added columns / table data.

Notes
- The migration uses IF NOT EXISTS checks; it's safe to re-run but still requires a backup beforehand.
- If transactions.id is not UUID in your DB, update the migration's FK type accordingly before applying.
