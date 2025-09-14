import { test, expect } from '@playwright/test'
import { E2ETestHelpers } from './helpers/test-data'

test.describe('Google OAuth login', () => {
  test('triggers NextAuth signIn with google provider', async ({ page }) => {
    await E2ETestHelpers.setupTestEnvironment(page)
    let signInCalled = false
    await page.route('**/api/auth/signin/google**', (route) => {
      signInCalled = true
      route.fulfill({ status: 200, body: 'ok' })
    })

    await page.goto('/portal/auth/signin')
    await page.getByTestId('google-signin-button').click()

    expect(signInCalled).toBe(true)
  })
})
