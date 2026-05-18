import { test, expect } from '@playwright/test'

/**
 * Demo-mode E2E sanity. These tests assume the app is built and served with
 * `NEXT_PUBLIC_DEMO_MODE=true`, exercising the frontend-only showcase path —
 * no Python services or backend HTTP required.
 */

test.describe('Demo mode', () => {
  test('login page shows "Try the demo" skip button', async ({ page }) => {
    await page.goto('/login')
    await expect(
      page.getByRole('button', { name: /try the demo/i }),
    ).toBeVisible()
  })

  test('clicking "Try the demo" lands on Overview', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /try the demo/i }).click()
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: /^Overview/i }),
    ).toBeVisible()
  })

  test('sidebar exposes all primary sections', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /try the demo/i }).click()
    // Use exact matches to avoid colliding with body content like "All cameras".
    await expect(
      page.getByRole('link', { name: 'Overview', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Cameras', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Incidents', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Rules', exact: true }),
    ).toBeVisible()
  })

  test('Cameras page shows empty state and "Pair camera" CTA', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /try the demo/i }).click()
    await page.getByRole('link', { name: /Cameras/i }).first().click()
    await expect(page).toHaveURL('/cameras')
    await expect(
      page.getByRole('heading', { name: /^Cameras/i }),
    ).toBeVisible()
    // Either empty state OR pair button must be visible.
    const pairBtn = page.getByRole('button', { name: /pair (your first )?camera/i })
    await expect(pairBtn.first()).toBeVisible()
  })

  test('Rules page seeds three default rules', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /try the demo/i }).click()
    await page.getByRole('link', { name: /Rules/i }).first().click()
    await expect(page).toHaveURL('/rules')
    await expect(
      page.getByText('Person in restricted zone'),
    ).toBeVisible()
    await expect(page.getByText(/Crowding/)).toBeVisible()
    await expect(
      page.getByText('Vehicle in pedestrian corridor'),
    ).toBeVisible()
  })
})
