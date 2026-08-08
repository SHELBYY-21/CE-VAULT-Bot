#!/usr/bin/env node
// Run an idempotent SQL migration against STAGING_DATABASE_URL using node-postgres
// Usage: set STAGING_DATABASE_URL then: node scripts/run-migration.js

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: STAGING_DATABASE_URL is not set. Example: postgres://user:pass@host:5432/db');
    process.exit(2);
  }

  const file = path.resolve(__dirname, '..', 'db', 'migrations', '20260807_add_live_message_fields.sql');
  if (!fs.existsSync(file)) {
    console.error('Migration file not found:', file);
    process.exit(3);
  }

  const sql = fs.readFileSync(file, 'utf8');
  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    console.log('Connected to', url.replace(/:\/\/.*@/, '://***@'));
    console.log('Beginning migration...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    try {
      await client.query('ROLLBACK');
      console.log('Rolled back transaction');
    } catch (e) {
      console.error('Rollback failed:', e.message || e);
    }
    process.exit(4);
  } finally {
    await client.end();
  }
}

main();
