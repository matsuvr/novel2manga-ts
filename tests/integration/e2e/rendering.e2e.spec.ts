import { expect, test } from '@playwright/test'

const SAMPLE_TEXT = 'これはレンダリング確認用の短いテキストです。'

interface ScenarioOutput {
  result?: {
    renderKey?: string
  }
}

const isScenarioOutput = (data: unknown): data is ScenarioOutput => {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as { result?: unknown }
  if (obj.result === undefined) return true
  if (typeof obj.result !== 'object' || obj.result === null) return false
  const res = obj.result as { renderKey?: unknown }
  return res.renderKey === undefined || typeof res.renderKey === 'string'
}

const isScenarioOutput = (data: unknown): data is ScenarioOutput => {
  return (
    typeof data === 'object' &&
    data !== null &&
    (!('result' in data) ||
      (typeof (data as { result: unknown }).result === 'object' &&
        (data as { result: unknown }).result !== null &&
        'renderKey' in (data as { result: unknown }).result &&
        typeof (data as { result: { renderKey: unknown } }).result.renderKey ===
          'string'))
  )
}
  test('returns rendered image for demo scenario', async ({ request, baseURL }) => {
    const scenarioRes = await request.post('/api/scenario/run', {
      data: {
        kind: 'demo',
        baseUrl: baseURL ?? 'http://localhost:3000',
        text: SAMPLE_TEXT,
      },
    })

    expect(scenarioRes.ok()).toBeTruthy()
    const scenarioJson: unknown = await scenarioRes.json()
    expect(isScenarioOutput(scenarioJson)).toBeTruthy()
    const renderKey = scenarioJson.result?.renderKey
    expect(renderKey).toBeTruthy()

    const jobId = renderKey.split('/')[0]
    const match = renderKey.match(/episode_(\d+)\/page_(\d+)\.png$/)
    expect(match).toBeTruthy()
    const [, ep, page] = match

    const imageRes = await request.get(`/api/render/${ep}/${page}?jobId=${jobId}`)
    expect(imageRes.status()).toBe(200)
    expect(imageRes.headers()['content-type']).toContain('image/png')
    const buffer = await imageRes.body()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
