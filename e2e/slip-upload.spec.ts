import { test, expect } from '@playwright/test';

// Mock Telegram API responses
const mockTelegramUpdate = {
  update_id: 1,
  message: {
    message_id: 1,
    from: { id: 123456, is_bot: false, first_name: 'Test', last_name: 'User' },
    chat: { id: -1001234567890, title: 'Test Group' },
    date: Math.floor(Date.now() / 1000),
    photo: [
      { file_id: 'test_file_id', file_unique_id: 'test_unique_id', file_size: 1024 },
    ],
    caption: 'โอน 5,000 บาท SCB 3376',
  },
};

test.describe('Telegram Bot - Webhook Security Boundary', () => {
  test('rejects an unsigned slip update without processing it', async ({ request }) => {
    // APIRequestContext does not use page.route; never fake a 200 response.
    // The isolated test webServer uses a synthetic secret, no real Telegram key.
    const response = await request.post('/api/telegram/webhook', {
      data: mockTelegramUpdate,
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).ok).toBe(false);
  });

  // Thai slip text parsing is owned by src/lib/__tests__/parseSlipText.test.ts (unit) —
  // no always-green string assertions belong in this E2E boundary suite.
});

test.describe('Dashboard - Open View, Protected Writes', () => {
  test('opens the dashboard without a login', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).toHaveTitle(/CE Vault/i);
  });

  test('does not let anonymous requests mark a transaction completed', async ({ page, baseURL }) => {
    const response = await page.request.post('/api/transactions/1/complete', { headers: { origin: baseURL ?? '' } });
    expect([401, 503]).toContain(response.status());
  });
});
