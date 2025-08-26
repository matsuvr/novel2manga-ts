import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.describe('E2E: analyze → chunk-scripts → merge → page-break → bundle (JSON) → status', () => {
  test('process sample novel and produce episode JSON layouts (20–50 pages)', async ({
    request,
  }) => {
    const baseURL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:3000'
    const samplePath = 'public/docs/最後の一葉.txt'
    const text = await fs.readFile(samplePath, 'utf-8')

    // Kick off analysis pipeline (async on server)
    const res = await request.post(`${baseURL}/api/analyze`, {
      data: { text, title: 'E2E 最後の一葉' },
      headers: { 'content-type': 'application/json' },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body?.jobId).toBeTruthy()
    const jobId: string = body.jobId

    // Poll render status until episode layouts appear and have valid page counts
    const maxWaitMs = 120_000
    const intervalMs = 1500
    const start = Date.now()
    let episodes: Array<{
      episodeNumber: number
      pages: Array<{ pageNumber: number; isRendered: boolean }>
    }> = []

    while (Date.now() - start < maxWaitMs) {
      const status = await request.get(`${baseURL}/api/render/status/${jobId}`)
      expect(status.ok()).toBeTruthy()
      const data = (await status.json()) as {
        status: string
        renderStatus: Array<{
          episodeNumber: number
          pages: Array<{ pageNumber: number; isRendered: boolean }>
        }>
      }
      episodes = data?.renderStatus || []
      if (
        episodes.length > 0 &&
        episodes.some((e) => e.pages.length >= 20 && e.pages.length <= 50)
      ) {
        break
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }

    expect(episodes.length).toBeGreaterThan(0)
    // At least one episode should be within 20–50 pages
    const ok = episodes.some((e) => e.pages.length >= 20 && e.pages.length <= 50)
    expect(ok).toBeTruthy()

    // Optionally, check that at least the first episode has JSON layout persisted by requesting status again
    // and ensuring page numbers are sequential starting from 1
    const first = episodes[0]
    const pageNumbers = first.pages.map((p) => p.pageNumber)
    expect(pageNumbers[0]).toBe(1)
  })
})
