Staging migration apply note

Created: 2026-08-07T18:11:44+07:00

Files added:
- db/migrations/20260807_add_live_message_fields.sql
- db/migrations/README-apply.md

Next steps to actually apply to staging:
1. Ensure a full backup has been taken.
2. Export STAGING_DATABASE_URL environment variable with staging DB connection.
3. Run: npm run migrate:staging
4. Verify schema + run integration smoke tests.

If you want me to run the migration now, provide:
- Confirmation that a backup exists
- STAGING_DATABASE_URL value (or a method to access staging)

Otherwise I will wait for confirmation before executing any migration commands.
