import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Privileged backend client. Never import from browser code or expose the secret key. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error('Supabase backend not configured: URL or SUPABASE_SECRET_KEY missing');
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
