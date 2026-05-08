import { test, expect } from '@playwright/test'
import { authenticate, mockAPI, TEST_TOKEN } from './helpers'

test.describe('Authentication', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'SafeVision' })).toBeVisible()
  })

  test('login page renders username and password fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('successful login sets cookie and redirects to dashboard', async ({ page }) => {
    await mockAPI(page)
    await page.goto('/login')

    await page.getByLabel('Username').fill('test-op')
    await page.getByLabel('Password').fill('secret')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // After login the cookie should be set and the page should redirect
    await expect(page).toHaveURL('/')
    const cookies = await page.context().cookies()
    const session = cookies.find((c) => c.name === 'sv_session')
    expect(session).toBeDefined()
    expect(session!.value).toBe(encodeURIComponent(TEST_TOKEN))
  })

  test('wrong credentials shows error message', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Incorrect username or password' }) })
    )
    await page.goto('/login')
    await page.getByLabel('Username').fill('wrong')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Incorrect username or password')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('authenticated user sees username and role in nav', async ({ page, context }) => {
    await authenticate(context, page.url() || 'http://localhost:3000')
    await mockAPI(page)
    await page.goto('/')

    await expect(page.getByText('test-op')).toBeVisible()
    await expect(page.getByText('operator')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('sign out clears cookie and redirects to /login', async ({ page, context }) => {
    await authenticate(context, 'http://localhost:3000')
    await mockAPI(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(page).toHaveURL(/\/login/)
    const cookies = await page.context().cookies()
    const session = cookies.find((c) => c.name === 'sv_session')
    expect(!session || session.value === '').toBe(true)
  })
})
