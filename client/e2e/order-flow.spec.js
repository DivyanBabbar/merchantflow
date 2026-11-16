import { test, expect } from '@playwright/test';

test('seller creates an order and simulates a balanced capture', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Order desk' })).toBeVisible();
  await page.getByRole('button', { name: 'Create pending order' }).click();
  const orderRow = page.locator('tbody tr').filter({ hasText: 'Demo notebook' }).first();
  await expect(orderRow).toContainText('PENDING');
  await orderRow.getByRole('button', { name: 'Simulate capture' }).click();
  await expect(orderRow).toContainText('PAID');
  await expect(orderRow).toContainText('Balanced');
});
