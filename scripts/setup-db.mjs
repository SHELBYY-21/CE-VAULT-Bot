// เตรียมส่วนที่ไม่ต้องใช้ DDL: storage bucket + seed admin/bank — รัน: node scripts/setup-db.mjs
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1) storage bucket 'slips' (public)
{
  const { error } = await sb.storage.createBucket('slips', { public: true });
  console.log('bucket slips:', error ? error.message : 'created ✓');
}

// 2) admin จริง (telegram_user_id 6049267196)
{
  const { data } = await sb.from('admins').select('id').eq('telegram_user_id', 6049267196).maybeSingle();
  if (!data) {
    const { error } = await sb.from('admins').insert({ telegram_user_id: 6049267196, name: 'Admin (จริง)' });
    console.log('admin 6049267196:', error ? error.message : 'inserted ✓');
  } else {
    console.log('admin 6049267196: exists ✓', data.id);
  }
}

// 3) บัญชีธนาคารเริ่มต้น (ถ้ายังไม่มี)
{
  const { data } = await sb.from('bank_accounts').select('id').limit(1);
  if (!data || data.length === 0) {
    const { error } = await sb.from('bank_accounts').insert({ label: 'กสิกร - หลัก', bank_name: 'KBANK' });
    console.log('bank account:', error ? error.message : 'inserted ✓');
  } else {
    console.log('bank account: exists ✓');
  }
}
