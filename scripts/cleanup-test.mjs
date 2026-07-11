// ลบธุรกรรมทดสอบ + รีเซ็ต holding ของแอดมินทดสอบ — รัน: node scripts/cleanup-test.mjs
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const del = await sb.from('transactions').delete().like('note', '%ทดสอบ%').select('id');
console.log('ลบ transaction ทดสอบ:', del.data?.length ?? 0, 'รายการ', del.error ? del.error.message : '');

const upd = await sb.from('admins').update({ holding_usdt: 0 }).eq('telegram_user_id', 6049267196).select('name');
console.log('รีเซ็ต holding:', upd.error ? upd.error.message : (upd.data?.map((a) => a.name).join(',') || 'ไม่พบ'));
