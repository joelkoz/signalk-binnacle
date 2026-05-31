import { expect, test } from '@playwright/test';

test('app shell renders the brand and a connection status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Binnacle')).toBeVisible();
  await expect(page.getByText(/Connecting|Connected|Reconnecting|Not connected/)).toBeVisible();
  await expect(page.getByText('SOG')).toBeVisible();
});
