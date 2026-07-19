// Supabase client ฝั่ง browser (ใช้ anon key) — สำหรับ Dashboard + Realtime
import { createClient } from '@supabase/supabase-js';

// fallback placeholder: ให้ build ผ่านได้แม้ env ยังไม่ถูกตั้ง (เช่น build ครั้งแรกบนโฮสต์ใหม่)
// ค่า NEXT_PUBLIC_* ถูกฝังตอน build — ต้องตั้ง env ให้ครบก่อน build จริงเสมอ
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn('[supabaseClient] ⚠️ ไม่พบ NEXT_PUBLIC_SUPABASE_URL — dashboard จะอ่านข้อมูลไม่ได้จนกว่าจะตั้ง env แล้ว build ใหม่');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
