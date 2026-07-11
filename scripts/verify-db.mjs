// ตรวจสถานะ DB ของโปรเจกต์ (อ่านค่าจาก .env.local) — รัน: node scripts/verify-db.mjs
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
console.log('URL:', url);
const sb = createClient(url, key, { auth: { persistSession: false } });

const NIL = '00000000-0000-0000-0000-000000000000';

for (const t of ['admins', 'bank_accounts', 'transactions', 'rates', 'bot_sessions']) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log('table', t.padEnd(15), error ? 'MISSING/ERR: ' + error.message : `ok (rows=${count})`);
}

for (const [fn, args] of [
  ['adjust_admin_holding', { p_admin_id: NIL, p_amount: 0 }],
  ['increment_bank_balance', { p_bank_id: NIL, p_amount: 0 }],
]) {
  const { error } = await sb.rpc(fn, args);
  console.log('rpc  ', fn.padEnd(24), error ? 'MISSING: ' + error.message : 'ok');
}

const { data: buckets, error: bErr } = await sb.storage.listBuckets();
console.log('buckets', bErr ? 'ERR: ' + bErr.message : buckets.map((b) => `${b.id}(public=${b.public})`).join(', ') || '(none)');
