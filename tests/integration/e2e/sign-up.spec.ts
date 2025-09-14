import { test, expect } from '@playwright/test'
import { E2ETestHelpers } from './helpers/test-data'

test.describe('Sign-up flow', () => {
  test('requires terms acceptance before submission', async ({ page }) => {
    await E2ETestHelpers.setupTestEnvironment(page)
    await page.goto('/sign-up')

    const submit = page.getByRole('button', { name: /sign up/i })
    await expect(submit).toBeDisabled()

    await page.getByRole('textbox', { type: 'email' }).fill('test@example.com')

    await page.getByRole('checkbox').check()
    await expect(submit).toBeEnabled()

    let submitted = false
    await page.exposeBinding('recordSubmit', () => {
      submitted = true
    })
    await page.evaluate(() => {
      document.querySelector('form')?.addEventListener('submit', () => {
        ;(window as unknown as { recordSubmit: () => void }).recordSubmit()
      })
    })

    await submit.click()
    expect(submitted).toBe(true)
  })
})
