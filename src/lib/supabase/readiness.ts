import 'server-only';
import { createSupabaseAdminClient } from './admin';

/** Read-only preflight. Never return credentials or financial row contents. */
export async function checkSupabaseReadiness() {
  const client = createSupabaseAdminClient();
  const tables = ['admins', 'transactions', 'bank_accounts', 'receivers', 'rates'] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count, error } = await client.from(table).select('id', { count: 'exact', head: true });
    if (error || count === null) throw new Error(`Supabase readiness failed for ${table}: ${error?.code ?? 'unknown'}`);
    counts[table] = count;
  }
  return { ready: true, counts };
}
