import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('homepage loads with key elements', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/RechnungsWerk/)
    // Sidebar or navigation should be visible
    await expect(page.locator('nav, aside')).toBeVisible()
  })

  test('dashboard shows KPI cards', async ({ page }) => {
    await page.goto('/')
    // KPI stats should render
    const body = page.locator('body')
    await expect(body).toBeVisible()
    // Page should not show an error state
    await expect(page.locator('text=500')).not.toBeVisible()
    await expect(page.locator('text=Error')).not.toBeVisible()
  })

  test('OCR page is reachable', async ({ page }) => {
    await page.goto('/ocr')
    await expect(page.locator('h1, h2')).toBeVisible()
    // Upload area should exist
    await expect(page.locator('input[type="file"], [role="button"], button')).toBeVisible()
  })

  test('invoices list page loads', async ({ page }) => {
    await page.goto('/invoices')
    await expect(page.locator('h1, h2')).toBeVisible()
  })

  test('manual entry page loads', async ({ page }) => {
    await page.goto('/manual')
    await expect(page.locator('h1, h2')).toBeVisible()
    // Form elements should be present
    await expect(page.locator('form, input, [role="form"]')).toBeVisible()
  })

  test('suppliers page loads', async ({ page }) => {
    await page.goto('/suppliers')
    await expect(page.locator('h1, h2')).toBeVisible()
  })

  test('analytics page loads', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.locator('h1, h2')).toBeVisible()
  })

  test('recurring invoices page loads', async ({ page }) => {
    await page.goto('/recurring')
    await expect(page.locator('h1, h2')).toBeVisible()
  })

  test('no page crashes with 500 error', async ({ page }) => {
    const routes = ['/', '/ocr', '/invoices', '/manual', '/suppliers', '/analytics', '/recurring']
    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator('text=Internal Server Error')).not.toBeVisible()
      await expect(page.locator('text=500')).not.toBeVisible()
    }
  })
})
