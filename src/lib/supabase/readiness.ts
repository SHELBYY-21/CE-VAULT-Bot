import 'server-only';
import { createSupabaseAdminClient } from './admin';

export async function checkSupabaseReadiness() {
  const db = createSupabaseAdminClient();
  const counts: Record<string, number> = {};
  for (const table of ['admins', 'transactions', 'bank_accounts', 'rates', 'bot_sessions', 'chat_settings']) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    if (error || count === null) throw new Error(`Supabase table unavailable: ${table} (${error?.code ?? 'unknown'})`);
    counts[table] = count;
  }
  return { ready: true, counts };
}
