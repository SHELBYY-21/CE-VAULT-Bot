import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWebhookInfo } from './webhook-info-safe.mjs';

test('safeWebhookInfo keeps delivery diagnostics and strips sensitive fields', () => {
  const result = safeWebhookInfo({
    url: 'https://example.test/api/telegram/webhook?token=secret',
    has_custom_certificate: false,
    pending_update_count: 2,
    ip_address: '203.0.113.10',
    last_error_date: 1791240000,
    last_error_message: 'Wrong response from the webhook: 404 Not Found',
    last_synchronization_error_date: 1791240001,
    max_connections: 40,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    secret_token: 'never-log-me',
  });

  assert.deepEqual(result, {
    pending_update_count: 2,
    ip_address: '203.0.113.10',
    last_error_date: 1791240000,
    last_error_message: 'Wrong response from the webhook: 404 Not Found',
    last_synchronization_error_date: 1791240001,
    max_connections: 40,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
  });
  assert.equal(JSON.stringify(result).includes('example.test'), false);
  assert.equal(JSON.stringify(result).includes('never-log-me'), false);
});

test('safeWebhookInfo normalizes malformed input without throwing', () => {
  assert.deepEqual(safeWebhookInfo(null), {
    pending_update_count: 0,
    ip_address: null,
    last_error_date: null,
    last_error_message: null,
    last_synchronization_error_date: null,
    max_connections: null,
    allowed_updates: [],
  });
});
