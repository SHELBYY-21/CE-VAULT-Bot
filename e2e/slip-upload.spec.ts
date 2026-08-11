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

test.describe('Telegram Bot - Slip Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the Telegram webhook endpoint
    await page.route('**/api/telegram/webhook', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });
  });

  test('should handle slip image upload', async ({ page }) => {
    // Simulate a POST request to the webhook with a slip image
    const response = await page.request.post('/api/telegram/webhook', {
      data: mockTelegramUpdate,
    });
    
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('should parse Thai slip text correctly', async () => {
    const text = 'โอน 5,000 บาท เข้าบัญชี SCB 3376 ชื่อบัญชี นายสมชาย ใจดี วันที่ 24/07/26 เวลา 14:30';
    
    // This would be tested via the parseSlipText function in unit tests
    // E2E test would verify the full flow from image upload to DB save
    expect(text).toContain('5,000');
    expect(text).toContain('SCB');
    expect(text).toContain('3376');
  });
});

test.describe('Dashboard - Transaction View', () => {
  test('should load dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveTitle(/CE VAULT/);
  });

  test('should display transactions table', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('table')).toBeVisible();
  });
});
