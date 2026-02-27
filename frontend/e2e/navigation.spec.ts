import { test, expect } from '@playwright/test'

test.describe('Marketing Pages', () => {
  test('homepage loads with title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/RechnungsWerk/)
  })

  test('pricing page loads', async ({ page }) => {
    await page.goto('/preise')
    await expect(page).toHaveTitle(/Preis|RechnungsWerk/)
  })

  test('blog page loads', async ({ page }) => {
    await page.goto('/blog')
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible()
  })

  test('glossary page loads', async ({ page }) => {
    await page.goto('/glossar')
    await expect(page).toHaveTitle(/Glossar/)
  })

  test('changelog page loads', async ({ page }) => {
    await page.goto('/changelog')
    await expect(page).toHaveTitle(/Changelog/)
  })

  test('404 page shows for unknown route', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz')
    await expect(page.locator('text=404')).toBeVisible()
  })
})
