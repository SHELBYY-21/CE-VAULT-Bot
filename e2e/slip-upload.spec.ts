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

test.describe('Dashboard - Anonymous Access Boundary', () => {
  test('redirects unauthenticated visitors to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page).toHaveTitle(/CE Vault/i);
  });

  test('does not return financial ledger data to anonymous requests', async ({ page }) => {
    const response = await page.request.get('/api/dashboard/data');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
});
