import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // `server-only` is a React Server Component guard that throws when imported
    // outside a server bundle. Unit tests import lib modules that pull in the
    // Supabase admin client, so stub the guard in tests instead of removing it
    // from production code.
    alias: {
      'server-only': path.resolve(process.cwd(), 'src/test-stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/stickers-webm.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/**/__tests__/**'],
    },
  },
});
