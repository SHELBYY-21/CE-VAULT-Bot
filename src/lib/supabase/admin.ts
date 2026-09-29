import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.supabase_secret_key;
  if (!url || !secret) throw new Error('Supabase server configuration missing');
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
