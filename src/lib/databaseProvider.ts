export type DatabaseProvider = 'supabase' | 'firebase';

/** Explicit mode selection only. No automatic financial database fallback. */
export function selectedDatabaseProvider(): DatabaseProvider {
  const raw = process.env.DATABASE_PROVIDER;
  if (raw === 'supabase' || raw === 'firebase') return raw;
  throw new Error('DATABASE_PROVIDER must explicitly be supabase or firebase');
}

export function requireSupabaseProvider(): void {
  if (selectedDatabaseProvider() !== 'supabase') {
    throw new Error('Supabase-only operation disabled by DATABASE_PROVIDER');
  }
}
