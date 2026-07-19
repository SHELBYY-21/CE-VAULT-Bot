import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

// Self-contained flat config (typescript-eslint + Next plugin). Kept non-type-aware
// so it is fast and robust across the app without a project service.
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'bot/**',
      'supabase/**',
      'assets/**',
      'scripts/**',
      'brandkit-test.html',
      'next-env.d.ts',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        window: 'readonly',
        requestAnimationFrame: 'readonly',
        matchMedia: 'readonly',
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      // ชั้น integration (Telegram/Supabase/OCR) ใช้ any/union กว้างโดยตั้งใจ
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      // รูปแบบเดิมในโค้ดฐาน (integration layer) — เตือนไว้ ไม่ทำให้ CI ล้ม
      'no-constant-binary-expression': 'warn',
      'no-useless-assignment': 'off',
    },
  },
);
