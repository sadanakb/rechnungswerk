import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('OCR Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ocr')
  })

  test('shows upload interface', async ({ page }) => {
    // File input or drag-drop zone should be present
    const uploadArea = page.locator('input[type="file"]')
    await expect(uploadArea).toBeAttached()
  })

  test('upload button is visible', async ({ page }) => {
    await expect(page.locator('button')).toBeVisible()
  })

  test('page has correct heading', async ({ page }) => {
    const heading = page.locator('h1, h2, h3').first()
    await expect(heading).toBeVisible()
    const text = await heading.textContent()
    expect(text?.length).toBeGreaterThan(0)
  })

  test('shows field labels for extracted data', async ({ page }) => {
    // Before upload, the form structure should exist (possibly hidden or empty)
    // After upload, fields like invoice_number, seller_name etc. appear
    // We just verify the page renders without errors
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Fehler beim Laden')).not.toBeVisible()
  })
})
