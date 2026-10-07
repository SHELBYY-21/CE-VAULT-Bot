import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const secretNames = [
  'API_SECRET',
  'BOT_TOKEN',
  'CE_API_TOKEN',
  'CIRCLE_API_KEY',
  'ENTITY_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'GROK_API_KEY',
  'OCR_SPACE_API_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_WEBHOOK_SECRET',
];

test('Envfile enforces strict secret policy without embedding secret values', () => {
  const envfile = read('Envfile');

  assert.match(envfile, /^strict true$/m);
  for (const name of secretNames) {
    assert.match(envfile, new RegExp(`env ["']${name}["']`), `${name} must be declared in Envfile`);
  }

  assert.doesNotMatch(envfile, /DOTENV_PRIVATE_KEY\s*=/);
  assert.doesNotMatch(envfile, /(?:sk-|ghp_|xox[baprs]-|-----BEGIN PRIVATE KEY-----)/);
});

test('dotenv private-key material stays ignored', () => {
  const gitignore = read('.gitignore');
  assert.match(gitignore, /^\.env\.keys$/m);
  assert.match(gitignore, /^\.env\.keys\.\*$/m);
});

test('dotenvx commands are pinned and kept separate from production start', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['env:check'], 'npx --yes @dotenvx/dotenvx@2.32.4 check');
  assert.equal(pkg.scripts['env:protect'], 'npx --yes @dotenvx/dotenvx@2.32.4 protect');
  assert.doesNotMatch(pkg.scripts.start, /dotenvx/);
});
