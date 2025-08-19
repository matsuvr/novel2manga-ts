import { expect, test } from '@playwright/test'
import { TEST_CONFIG } from '../../../src/config/test-data'

interface ScenarioOutput {
  result?: {
    renderKey?: string
  }
}

/**
 * ScenarioOutput型ガード関数
 * レスポンスがScenarioOutput形式かを判定
 */
const isScenarioOutput = (data: unknown): data is ScenarioOutput => {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as { result?: unknown }
  if (obj.result === undefined) return true
  if (typeof obj.result !== 'object' || obj.result === null) return false
  const res = obj.result as { renderKey?: unknown }
  return res.renderKey === undefined || typeof res.renderKey === 'string'
}

/**
 * renderKeyを解析してjobId、episode、pageを抽出
 */
const parseRenderKey = (renderKey: string) => {
  const jobId = renderKey.split('/')[0]
  const match = renderKey.match(TEST_CONFIG.RENDER_KEY_PATTERN)
  if (!match) {
    throw new Error(`Invalid renderKey format: ${renderKey}`)
  }
  return { jobId, episode: match[1], page: match[2] }
}

test.describe('レンダリングAPI E2E テスト', () => {
  test('デモシナリオに対してレンダリングされた画像を返す', async ({ request, baseURL }) => {
    try {
      // 1. シナリオ実行API呼び出し
      const scenarioRes = await request.post('/api/scenario/run', {
        data: {
          kind: 'demo',
          baseUrl: baseURL ?? 'http://localhost:3000',
          text: TEST_CONFIG.SAMPLE_RENDERING_TEXT,
        },
      })

      if (!scenarioRes.ok()) {
        const errorText = await scenarioRes.text()
        console.error(`Scenario API failed: ${scenarioRes.status()} ${errorText}`)
        throw new Error(`Scenario creation failed: ${scenarioRes.status()}`)
      }

      // 2. レスポンスの型チェック
      const scenarioJson: unknown = await scenarioRes.json()
      expect(isScenarioOutput(scenarioJson)).toBeTruthy()

      const scenarioOutput = scenarioJson as ScenarioOutput
      const renderKey = scenarioOutput.result?.renderKey
      expect(renderKey, 'renderKey should be present in response').toBeTruthy()

      if (!renderKey) {
        throw new Error('renderKey is missing from scenario response')
      }

      // 3. renderKeyを解析
      const { jobId, episode, page } = parseRenderKey(renderKey)
      console.log(`Parsed renderKey: jobId=${jobId}, episode=${episode}, page=${page}`)

      // 4. 画像取得API呼び出し
      const imageRes = await request.get(`/api/render/${episode}/${page}?jobId=${jobId}`)

      if (!imageRes.ok()) {
        const errorText = await imageRes.text()
        console.error(`Image API failed: ${imageRes.status()} ${errorText}`)
        throw new Error(`Image retrieval failed: ${imageRes.status()}`)
      }

      // 5. 画像レスポンスの検証
      expect(imageRes.status()).toBe(200)
      expect(imageRes.headers()['content-type']).toContain('image/png')

      const buffer = await imageRes.body()
      expect(buffer.byteLength, 'Image buffer should not be empty').toBeGreaterThan(0)

      console.log(`Successfully retrieved image: ${buffer.byteLength} bytes`)
    } catch (error) {
      console.error('E2E test failed:', error)
      throw error
    }
  })
})
