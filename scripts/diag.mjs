import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const t of ['admins', 'zzz_definitely_not_a_table']) {
  const head = await sb.from(t).select('id', { count: 'exact', head: true });
  const real = await sb.from(t).select('*').limit(1);
  console.log(`[${t}]`);
  console.log('  head:', head.error ? 'ERR ' + head.error.message : `ok count=${head.count}`);
  console.log('  real:', real.error ? 'ERR ' + real.error.message : `ok rows=${JSON.stringify(real.data)}`);
}
