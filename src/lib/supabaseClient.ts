// Supabase client ฝั่ง browser (ใช้ anon key) — สำหรับ Dashboard + Realtime
import { createClient } from '@supabase/supabase-js';

// ใช้ placeholder ตอน build เพื่อไม่ให้ static prerender ล้มถ้า ENV ยังไม่ถูกตั้งใน Vercel
// Runtime จริงของ Dashboard ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'build-time-placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
