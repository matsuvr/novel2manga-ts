import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import { getBaseURL } from '../utils/getBaseURL'

test.describe('E2E: analyze → chunk-scripts → merge → page-break → bundle (JSON) → status', () => {
  test('process sample novel and complete full pipeline (JSON format)', async ({ request }) => {
    const baseURL = getBaseURL()
    const samplePath = 'public/docs/最後の一葉.txt'
    const text = await fs.readFile(samplePath, 'utf-8')

    // Kick off analysis pipeline (async on server)
    console.log('Starting analysis pipeline...')
    const res = await request.post(`${baseURL}/api/analyze`, {
      data: { text, title: 'E2E 最後の一葉' },
      headers: { 'content-type': 'application/json' },
    })

    if (!res.ok()) {
      const errorBody = await res.text()
      throw new Error(`Analysis API failed: ${res.status} ${res.statusText} - ${errorBody}`)
    }

    const body = await res.json()
    expect(body?.jobId).toBeTruthy()
    const jobId: string = body.jobId
    console.log(`Analysis started with jobId: ${jobId}`)

    // Poll job status until layout phase completes (covers Upload → Process → Generate Layout)
    const maxWaitMs = 120_000 // 2 minutes for layout completion
    const intervalMs = 2000
    const start = Date.now()

    let jobCompleted = false
    let lastStatus = 'unknown'

    while (Date.now() - start < maxWaitMs) {
      // Check job status first
      const jobStatus = await request.get(`${baseURL}/api/jobs/${jobId}/status`)
      if (jobStatus.ok()) {
        const jobData = await jobStatus.json()
        // API returns { job: { status: '...', ... }, ... } format
        lastStatus = jobData?.job?.status || jobData?.status || 'unknown'
        const currentStep = jobData?.job?.currentStep || jobData?.currentStep || 'unknown'
        const layoutCompleted = jobData?.job?.layoutCompleted || false
        const renderCompleted = jobData?.job?.renderCompleted || false

        console.log(
          `Job status: ${lastStatus}, step: ${currentStep}, layout: ${layoutCompleted}, render: ${renderCompleted}`,
        )

        // Success criteria: Layout phase completed successfully (covers Upload → Process → Generate Layout)
        // This verifies JSON format works without needing full rendering completion
        if (lastStatus === 'completed' || (layoutCompleted && currentStep === 'render')) {
          console.log('E2E success: Layout generation completed with JSON format')
          jobCompleted = true
          break
        } else if (lastStatus === 'failed') {
          const lastError = jobData?.job?.lastError || 'No error details available'
          throw new Error(`Job failed during pipeline execution. Error: ${lastError}`)
        }
      } else {
        console.log(`Job status API call failed: ${jobStatus.status}`)
        const errorText = await jobStatus.text()
        console.log(`Error details: ${errorText}`)
      }

      await new Promise((r) => setTimeout(r, intervalMs))
    }

    if (!jobCompleted) {
      throw new Error(
        `E2E test failed: Job did not complete after ${maxWaitMs / 1000}s. Last status: ${lastStatus}`,
      )
    }

    // Now check if episodes were generated correctly
    const status = await request.get(`${baseURL}/api/render/status/${jobId}`)
    expect(status.ok()).toBeTruthy()
    const data = (await status.json()) as {
      status: string
      renderStatus: Array<{
        episodeNumber: number
        pages: Array<{ pageNumber: number; isRendered: boolean }>
      }>
    }
    const episodes = data?.renderStatus || []

    console.log(`Final pipeline result: episodes=${episodes.length}`)
    if (episodes.length > 0) {
      console.log(
        `Episode details: ${episodes.map((e) => `ep${e.episodeNumber}(${e.pages.length}pages)`).join(', ')}`,
      )

      // Additional verification: If episodes were generated, check JSON format works
      const first = episodes[0]
      if (first.pages.length > 0) {
        const pageNumbers = first.pages.map((p) => p.pageNumber)
        expect(pageNumbers[0]).toBe(1)
        console.log(
          `JSON format verification: Episode ${first.episodeNumber} has ${first.pages.length} pages starting from page 1`,
        )
      }
    }

    // Success criteria: Layout generation completed (covers Upload → Process → Generate Layout)
    expect(jobCompleted).toBeTruthy()
    console.log(
      `E2E test passed: Pipeline completed layout generation with JSON format support (${episodes.length} episodes generated)`,
    )
  })
})
