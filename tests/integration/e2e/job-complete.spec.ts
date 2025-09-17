import { expect, request, test } from '@playwright/test'
import { E2ETestHelpers, TEST_NOVELS } from './helpers/test-data'

// This E2E test ensures that when a job is completed, the client transitions
// from the progress page to the results page and the results page is served
// (HTTP 200). The test avoids heavy processing by creating a job and
// immediately marking it completed via the API used in normal flows.

test.describe('Job completion and results page', () => {
  test('navigates to results page when job is completed', async ({ page, baseURL }) => {
    await E2ETestHelpers.setupTestEnvironment(page)

    if (!baseURL) {
      throw new Error('BASE_URL is required for E2E tests')
    }

    // 1) Create a novel via API
    const apiCtx = await request.newContext()
    const novelRes = await apiCtx.post(`${baseURL}/api/novel`, {
      data: {
        title: 'E2E Test Novel',
        author: 'E2E Tester',
        originalText: TEST_NOVELS.SHORT,
      },
    })
    expect(novelRes.ok()).toBeTruthy()
    const novelBody = await novelRes.json()
    const novelId = novelBody?.data?.id
    expect(typeof novelId).toBe('string')

    // 2) Create a job via API (use existing create job endpoint if present)
    // The application exposes /api/jobs (plural). Try that first, then fallback to legacy /api/job if present.
    let createJobRes = await apiCtx.post(`${baseURL}/api/jobs`, {
      data: { novelId },
    })
    if (!createJobRes.ok()) {
      // Fallback to legacy singular endpoint if the environment has it
      createJobRes = await apiCtx.post(`${baseURL}/api/job`, {
        data: { novelId },
      })
    }
    expect(createJobRes.ok()).toBeTruthy()
    const jobBody = await createJobRes.json()
    const jobId = jobBody?.data?.id
    expect(typeof jobId).toBe('string')

    // 3) Immediately mark job as completed via the job status API or DB helper
    // Try an existing update endpoint if present
    // Mark job as completed using the supported /api/jobs/[jobId]/status endpoint
    let completeRes = await apiCtx.post(`${baseURL}/api/jobs/${jobId}/status`, { data: { status: 'completed' } })
    if (!completeRes.ok()) {
      // Fallback: try legacy /api/job/{id}/complete then /api/job/{id}/status
      completeRes = await apiCtx.post(`${baseURL}/api/job/${jobId}/complete`)
      if (!completeRes.ok()) {
        await apiCtx.post(`${baseURL}/api/job/${jobId}/status`, { data: { status: 'completed' } })
      }
    }

    // 4) Visit the progress page, which will call /api/resume and mount the ProcessingProgress
    // We expect ProcessingProgress to trigger navigation to /novel/:novelId/results/:jobId
    await page.goto(`/novel/${novelId}/progress`)

    // Wait for navigation to results page
    await page.waitForURL(new RegExp(`/novel/${novelId}/results/${jobId}`), { timeout: 10000 })

    // Confirm results page responded with 200 by checking an element that's present on results page
    // For robustness, check that the Job ID is displayed
    await expect(page.locator(`text=Job: ${jobId}`)).toBeVisible({ timeout: 5000 })
  })
})
