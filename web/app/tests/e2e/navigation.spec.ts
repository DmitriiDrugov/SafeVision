import { test, expect } from '@playwright/test'
import { authenticate, mockAPI } from './helpers'

test.beforeEach(async ({ page, context }) => {
  await authenticate(context, 'http://localhost:3000')
  await mockAPI(page)
})

test.describe('Navigation', () => {
  test('nav bar has all expected links', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Incidents' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Cameras' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Rules' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Configure' })).toBeVisible()
  })

  test('dashboard page renders severity cards', async ({ page }) => {
    await page.goto('/')
    // Dashboard shows severity count cards
    await expect(page.getByText(/critical/i)).toBeVisible()
    await expect(page.getByText(/high/i)).toBeVisible()
  })

  test('incidents page loads and shows table', async ({ page }) => {
    await page.goto('/incidents')
    // Table header columns
    await expect(page.getByText('Severity')).toBeVisible()
    await expect(page.getByText('Status')).toBeVisible()
    await expect(page.getByText('Camera')).toBeVisible()
    // Sample row
    await expect(page.getByText('cam01')).toBeVisible()
  })

  test('cameras page loads and shows camera row', async ({ page }) => {
    await page.goto('/cameras')
    await expect(page.getByText('cam01')).toBeVisible()
    await expect(page.getByText('Line A')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit zones' })).toBeVisible()
  })

  test('rules page loads and shows rule row', async ({ page }) => {
    await page.goto('/rules')
    await expect(page.getByText('no_helmet_zone_a')).toBeVisible()
    await expect(page.getByText('forklift_zone')).toBeVisible()
  })

  test('configure page loads with chat UI', async ({ page }) => {
    await page.goto('/configure')
    await expect(page.getByRole('textbox')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /send|ask/i })
    ).toBeVisible()
  })
})
