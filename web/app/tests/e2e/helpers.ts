/**
 * E2E test helpers.
 *
 * authenticate() sets the sv_session cookie to a pre-computed test JWT so
 * the Next.js middleware lets the request through and NavBar shows the user.
 *
 * mockAPI() stubs backend calls via page.route() so no live services are
 * needed. Call it before navigating to a page.
 */

import type { BrowserContext, Page } from '@playwright/test'

// Pre-computed JWT: header.payload.sig where payload decodes to
// {"sub":"test-op","role":"operator","exp":9999999999,"iat":1}
// The signature is fake — parseUser() in auth.ts doesn't verify it.
const HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
const PAYLOAD = Buffer.from(
  JSON.stringify({ sub: 'test-op', role: 'operator', exp: 9_999_999_999, iat: 1 })
)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '')
export const TEST_TOKEN = `${HEADER}.${PAYLOAD}.fakesig`

export async function authenticate(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    {
      name: 'sv_session',
      value: TEST_TOKEN,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ])
}

// ── Sample API payloads ───────────────────────────────────────────────────

const SAMPLE_INCIDENT = {
  id: 'inc-001',
  rule_id: 'no_helmet_zone_a',
  camera_id: 'cam01',
  zone_id: 'forklift_zone',
  severity: 'high',
  status: 'open',
  acknowledged_by: null,
  acknowledged_at: null,
  resolved_at: null,
  clip_url: null,
  detection_payload: { objects: [] },
  detected_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const SAMPLE_RULE = {
  name: 'no_helmet_zone_a',
  zone: 'forklift_zone',
  condition: { object: 'person', missing_ppe: 'helmet', action: null, duration_seconds: null, min_count: null },
  action: { type: 'alert', severity: 'high', channel: 'dashboard' },
  enabled: true,
}

const SAMPLE_CAMERA = {
  id: 'cam01',
  name: 'Line A',
  rtsp_url: 'rtsp://192.168.10.100:554/stream1',
  enabled: true,
  zones: [],
}

// ── Route mocking ─────────────────────────────────────────────────────────

export async function mockAPI(page: Page) {
  const incidents = [SAMPLE_INCIDENT]
  const rules = [SAMPLE_RULE]
  const cameras = [SAMPLE_CAMERA]

  await page.route('**/api/v1/incidents**', (route) => {
    const url = route.request().url()
    if (url.includes('/acknowledge') || url.includes('/resolve') || url.includes('/false-positive')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...SAMPLE_INCIDENT, status: 'acknowledged' }) })
    }
    if (url.match(/incidents\/inc-\d+$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_INCIDENT) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(incidents) })
  })

  await page.route('**/api/v1/auth/**', (route) => {
    if (route.request().method() === 'POST' && route.request().url().includes('/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: TEST_TOKEN, username: 'test-op', role: 'operator' }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'test-op', role: 'operator' }) })
  })

  await page.route('**/api/v1/rules**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rules) })
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(SAMPLE_RULE) })
  })

  await page.route('**/api/v1/cameras**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cameras) })
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(SAMPLE_CAMERA) })
  })

  // Block WebSocket upgrade — not needed for E2E page tests
  await page.route('ws://**', (route) => route.abort())
}
