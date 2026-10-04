export type DatabaseProvider = 'supabase' | 'firebase';

/**
 * Supabase is the default provider since the 2026-10-02 operational cutover.
 * DATABASE_PROVIDER is optional: unset (or 'supabase') selects Supabase,
 * 'firebase' is still honored for legacy rollouts, and any other value fails closed.
 */
export function selectedDatabaseProvider(): DatabaseProvider {
  const raw = process.env.DATABASE_PROVIDER;
  if (raw === undefined || raw === '' || raw === 'supabase') return 'supabase';
  if (raw === 'firebase') return 'firebase';
  throw new Error('DATABASE_PROVIDER must be supabase or firebase (unset defaults to supabase)');
}

export function requireSupabaseProvider(): void {
  if (selectedDatabaseProvider() !== 'supabase') {
    throw new Error('Supabase-only operation disabled by DATABASE_PROVIDER');
  }
}
