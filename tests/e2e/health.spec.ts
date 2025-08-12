import { expect, test } from '@playwright/test'

// 最小ヘルスチェック: Next.js dev / build 環境を問わず /api/health が 200 を返すこと
// 実行前にサーバが起動している必要があります (CI では別ジョブで dev/server を起動)

test.describe('health endpoint', () => {
  test('GET /api/health returns ok', async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
    const res = await request.get(`${baseURL}/api/health`)
    expect(res.status(), 'status should be 200').toBe(200)
    const json = await res.json()
    // 統一成功レスポンス形式 { success: true, ... } を許容
    expect(json.success).toBe(true)
  })
})
