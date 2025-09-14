import { test, expect } from '@playwright/test'
import { E2ETestHelpers } from './helpers/test-data'

test.describe('Google OAuth login', () => {
  test('triggers NextAuth signIn with google provider', async ({ page }) => {
    await E2ETestHelpers.setupTestEnvironment(page)
    let signInCalled = false

    await page.route('**/api/auth/signin/google**', (route) => {
      signInCalled = true
      route.abort()
    })

    await page.goto('/portal/auth/signin')
    await page.getByRole('button', { name: 'Googleでログイン' }).click()

    expect(signInCalled).toBe(true)
  })
})
