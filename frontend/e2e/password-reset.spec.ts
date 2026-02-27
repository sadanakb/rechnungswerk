import { test, expect } from '@playwright/test'

test.describe('Password Reset Flow', () => {
  test('forgot password page renders', async ({ page }) => {
    await page.goto('/passwort-vergessen')
    await expect(page.locator('text=Passwort')).toBeVisible()
  })

  test('login page has forgot password link', async ({ page }) => {
    await page.goto('/login')
    const link = page.locator('a[href="/passwort-vergessen"]')
    await expect(link).toBeVisible()
  })
})
