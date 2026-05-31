import { expect, test } from '@playwright/test';

test('app shell renders the brand and status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Binnacle')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();
});
