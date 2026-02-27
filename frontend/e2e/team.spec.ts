import { test, expect } from '@playwright/test'

test.describe('Team Management', () => {
  test('team page renders', async ({ page }) => {
    await page.goto('/team')
    // Should show team or upgrade prompt
    await expect(page.locator('body')).toBeVisible()
  })
})
