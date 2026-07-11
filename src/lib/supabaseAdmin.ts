// Supabase client ฝั่ง server (ใช้ service_role key) — ใช้ใน API route เท่านั้น
// service_role bypass RLS จึงเขียน/อัปเดตตารางได้ ห้าม import ไฟล์นี้ใน client component
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://localhost';
// ใช้ placeholder ตอน build (คีย์ว่าง) เพื่อไม่ให้ createClient throw — runtime จริงต้องตั้งค่าใน ENV
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'build-time-placeholder';

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
