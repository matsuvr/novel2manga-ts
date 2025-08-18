import { expect, test } from '@playwright/test'

test.describe('Scenario Orchestrator (demo) end-to-end', () => {
  test('runs analyze → layout → render via /api/scenario/run (demo)', async ({
    request,
    baseURL,
  }) => {
    const url = `${baseURL}/api/scenario/run`
    const payload = {
      kind: 'demo',
      baseUrl: baseURL,
      text: 'これはE2Eテスト用の短いデモテキストです。',
    }
    const res = await request.post(url, {
      data: payload,
    })
    expect(res.ok()).toBeTruthy()
    const json = await res.json()
    expect(json?.ok).toBeTruthy()
    expect(json?.kind).toBe('demo')
    expect(json?.result?.renderKey).toBeTruthy()
  })
})
