import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Integration test that simulates the full workflow:
 * 1. Upload novel text
 * 2. Analyze text to create chunks and run chunk analysis
 * 3. Generate episodes from analyzed chunks
 * 4. Generate panel layout for the first episode
 */

// Constants for polling
const MAX_POLL_ATTEMPTS = 60 // 最大60回試行
const POLLING_INTERVAL_MS = 5000 // 5秒間隔

describe('Novel to manga full flow', () => {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000'
  const novelFile = path.join(process.cwd(), 'docs', '宮本武蔵地の巻.txt')
  let novelId = ''
  let jobId = ''

  it('uploads novel text', async () => {
    const text = await fs.readFile(novelFile, 'utf-8')
    expect(text.length).toBeGreaterThan(1000)

    const res = await fetch(`${baseUrl}/api/novel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    expect(res.ok).toBe(true)
    const json = await res.json()
    expect(json.uuid).toBeDefined()
    novelId = json.uuid
  }, 30000)

  it('analyzes text into chunks', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelId }),
    })

    expect(res.ok).toBe(true)
    const json = await res.json()
    // Expect API response to have { data: { jobId: string } }
    expect(json.data).toBeDefined()
    expect(typeof json.data).toBe('object')
    expect(json.data.jobId).toBeDefined()
    jobId = json.data.jobId
  }, 600000) // gpt-5-mini-2025-08-07は時間がかかるため10分に増加

  it.skip('generates episodes (skipped for now)', async () => {
    // エピソード生成は時間がかかるため、この統合テストではスキップ
    // 必要な場合は別の専用テストで実行する
    const startRes = await fetch(`${baseUrl}/api/jobs/${jobId}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(startRes.ok).toBe(true)

    // poll job status until episodes completed or timeout
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      const statusRes = await fetch(`${baseUrl}/api/jobs/${jobId}/status`)
      if (statusRes.ok) {
        const statusJson = await statusRes.json()
        if (statusJson.job?.episodeCompleted) {
          break
        }
      }
      await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS))
    }

    const epRes = await fetch(`${baseUrl}/api/jobs/${jobId}/episodes`)
    expect(epRes.ok).toBe(true)
    const epJson = await epRes.json()
    expect(Array.isArray(epJson.episodes)).toBe(true)
    expect(epJson.episodes.length).toBeGreaterThan(0)
  }, 600000)

  it.skip('generates layout for first episode (skipped for now)', async () => {
    // エピソードが生成されていないため、レイアウト生成もスキップ
    const layoutRes = await fetch(`${baseUrl}/api/layout/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, episodeNumber: 1 }),
    })
    expect(layoutRes.ok).toBe(true)
    const layoutJson = await layoutRes.json()
    expect(layoutJson.layout).toBeDefined()
  }, 120000)
})