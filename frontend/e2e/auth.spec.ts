import { test, expect } from '@playwright/test'

test.describe('Authentication Pages', () => {
  test('login page renders with form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible()
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('register page renders with form', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible()
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
  })

  test('login page has link to register', async ({ page }) => {
    await page.goto('/login')
    const registerLink = page.locator('a[href*="register"]')
    await expect(registerLink).toBeVisible()
  })
})
