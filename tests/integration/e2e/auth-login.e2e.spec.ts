import { expect, test } from '@playwright/test'

// `/portal/api/auth/login` should redirect to Google OAuth endpoint
// This verifies that Auth.js routing is correctly mounted

// PlaywrightはWSL2環境では正常に動作しないため手動実行に委ねる
test.skip('login endpoint redirects to Google', async ({ request }) => {
  const res = await request.get('/portal/api/auth/login')
  expect(res.status()).toBe(302)
  const location = res.headers()['location']
  expect(location).toContain('accounts.google.com')
})
