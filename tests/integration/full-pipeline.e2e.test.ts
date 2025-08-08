/**
 * 新APIフローに沿ったエンドツーエンド統合テスト
 * フロー: 小説アップロード -> ジョブ作成/チャンク分割(splitOnly) -> ジョブステータス確認
 * 注意: APIのフォールバックは全廃。LLMを呼ばないスモークとして splitOnly で検証する。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

describe('小説→漫画 生成パイプライン E2E', () => {
  const novelPath = path.join(process.cwd(), 'docs', '宮本武蔵地の巻.txt')
  let novelText: string
  let novelId: string
  let jobId: string

  beforeAll(async () => {
    novelText = await fs.readFile(novelPath, 'utf-8')
    expect(novelText.length).toBeGreaterThan(1000)
  })

  it('1) /api/novel でアップロードし、novelIdが返る', async () => {
    const res = await fetch(`${BASE_URL}/api/novel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: novelText }),
    })
    expect(res.ok).toBe(true)
    const data = (await res.json()) as any
    expect(data.uuid).toBeTypeOf('string')
    novelId = data.uuid
  }, 60_000)

  it('2) /api/analyze でジョブ発行とチャンク作成（splitOnlyでLLM未実行）', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelId, splitOnly: true }),
    })
    expect(res.ok).toBe(true)
    const data = (await res.json()) as any
    expect(data.jobId).toBeTypeOf('string')
    expect(data.chunkCount).toBeGreaterThan(0)
    jobId = data.jobId

    // ステータスが取得できることを確認
    const st = await fetch(`${BASE_URL}/api/jobs/${jobId}/status`)
    expect(st.ok).toBe(true)
    const stJson = (await st.json()) as any
    expect(stJson.job?.id).toBe(jobId)
  }, 60_000)

  it('3) /api/jobs/:jobId/status でジョブ進捗（split 完了を確認）', async () => {
    const st = await fetch(`${BASE_URL}/api/jobs/${jobId}/status`)
    expect(st.ok).toBe(true)
    const stJson = (await st.json()) as any
    expect(stJson.job?.id).toBe(jobId)
    expect(stJson.job?.splitCompleted).toBe(true)
    expect(stJson.job?.totalChunks).toBeGreaterThan(0)
  }, 60_000)

  it('4) /api/jobs/:jobId/episodes は splitOnly 直後は 404 を返す（エピソード未生成）', async () => {
    const epRes = await fetch(`${BASE_URL}/api/jobs/${jobId}/episodes`)
    expect(epRes.ok).toBe(false)
    expect(epRes.status).toBe(404)
  }, 60_000)

  it('5) /api/render/status/:jobId はエピソードが無ければ no_episodes を返す', async () => {
    const stRes = await fetch(`${BASE_URL}/api/render/status/${jobId}`)
    expect(stRes.ok).toBe(true)
    const st = (await stRes.json()) as any
    expect(st.status).toBe('no_episodes')
  }, 60_000)
})
