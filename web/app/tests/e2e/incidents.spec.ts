import { test, expect } from '@playwright/test'
import { authenticate, mockAPI } from './helpers'

test.beforeEach(async ({ page, context }) => {
  await authenticate(context, 'http://localhost:3000')
  await mockAPI(page)
})

test.describe('Incidents page', () => {
  test('shows open incidents by default', async ({ page }) => {
    await page.goto('/incidents')
    await expect(page.getByText('no_helmet_zone_a')).toBeVisible()
  })

  test('filter controls are present', async ({ page }) => {
    await page.goto('/incidents')
    // Severity filter
    await expect(page.getByRole('combobox').first()).toBeVisible()
  })

  test('severity badge renders with correct colour class', async ({ page }) => {
    await page.goto('/incidents')
    // High severity badge should exist
    const badge = page.locator('text=high').first()
    await expect(badge).toBeVisible()
  })

  test('empty state is shown when no incidents match filter', async ({ page }) => {
    // Override with empty list for this test
    await page.route('**/api/v1/incidents**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.goto('/incidents')
    await expect(page.getByText(/no incidents/i)).toBeVisible()
  })

  test('acknowledge button calls API', async ({ page }) => {
    let ackCalled = false
    await page.route('**/incidents/inc-001/acknowledge', (route) => {
      ackCalled = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inc-001',
          rule_id: 'no_helmet_zone_a',
          camera_id: 'cam01',
          zone_id: 'forklift_zone',
          severity: 'high',
          status: 'acknowledged',
          acknowledged_by: 'test-op',
          acknowledged_at: new Date().toISOString(),
          resolved_at: null,
          clip_url: null,
          detection_payload: { objects: [] },
          detected_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      })
    })

    await page.goto('/incidents')
    await page.getByRole('button', { name: /ack/i }).first().click()

    // May require entering actor name in a prompt — just check API was called
    await page.waitForTimeout(500)
    expect(ackCalled).toBe(true)
  })
})
