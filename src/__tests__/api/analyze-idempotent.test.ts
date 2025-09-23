import { describe, expect, it, vi } from 'vitest'

// Use real database/services for this test to exercise locking
vi.doUnmock('@/db')
vi.doUnmock('@/services/database')

import { db } from '@/services/database'

// NextRequest モック生成ヘルパ
function makeRequest(body: unknown, url = 'http://localhost/api/analyze') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

// 認証ラッパ withAuth が内部で getAuthenticatedUser を呼ぶためテスト用にユーザーを差し込む
vi.mock('@/utils/api-auth', async (orig) => {
  const actual: any = await orig()
  return {
    ...actual,
    withAuth: (handler: any) => (req: any, user?: any) => handler(req, user || { id: 'user-1' }),
    getAuthenticatedUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
  }
})

// narrativity 分類など副作用のある LLM 呼び出しをスキップ / 安定化
vi.mock('@/utils/branch-marker', () => ({
  ensureBranchMarker: vi.fn().mockResolvedValue({ created: false, branch: 'NORMAL' }),
  saveBranchMarker: vi.fn(),
}))
vi.mock('@/utils/narrativity-classifier', () => ({ classifyNarrativity: vi.fn().mockResolvedValue({ branch: 'NORMAL' }) }))

// Chunk Script 変換で LLM を呼ぶ convertChunkToMangaScript を簡易モック
vi.mock('@/agents/script/script-converter', () => ({
  convertChunkToMangaScript: vi.fn().mockResolvedValue({
    panels: [{ panelNumber: 1, description: 'Test panel' }],
    characters: [],
    locations: [],
    props: [],
    style_tone: 'serious',
    style_art: 'manga',
    style_sfx: 'standard'
  }),
}))

// Storage 実装は実際のインメモリ / ローカルを使用

import { db as realDb } from '@/services/database'
// novels() サービスが ensureNovel / getNovel を持たないモックで失敗するため最低限のモックを注入
import type { Novel } from '@/types'
;(realDb as any).novels = () => ({
  ensureNovel: async (id: string): Promise<Novel> => ({ id, title: 'Mock Novel', userId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any),
  getNovel: async (id: string): Promise<Novel | null> => ({ id, title: 'Mock Novel', userId: 'user-1', text: 'これはテスト用の小説本文です。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any),
})

describe('POST /api/analyze idempotency', () => {

  it.skip('同一 novelId で素早い二重呼び出しをしても 1 つの jobId を再利用する', async () => {
    // TODO: Re-enable after updating shared database/service mock to include novel_job_locks table creation
  // 動的 import (モック適用後)
    const { POST: analyzePost } = await import('@/app/api/analyze/route')
    const novelId = 'novel-idemp-1'
    // 同じ novelId + text 指定 (2 回目は novelId のみ) で再利用を確認
    const req1 = makeRequest({ novelId, text: 'これはテスト用の小説本文です。' })
  // 2回目も text を送って storage 不足による NOT_FOUND を回避 (本番では1回目保存後 fetch-from-storage パターンもあるがテスト簡略化)
  const req2 = makeRequest({ novelId, text: 'これはテスト用の小説本文です。' })

    const [res1, res2] = await Promise.all([analyzePost(req1), analyzePost(req2)])
    const j1 = await res1.json()
    const j2 = await res2.json()
  // デバッグ出力
  // eslint-disable-next-line no-console
  console.log('analyze idempotent debug', { j1, j2 })

  const jobId1 = j1.jobId || j1.id || j1.data?.jobId
  const jobId2 = j2.jobId || j2.id || j2.data?.jobId
  expect(jobId1).toBeTruthy()
  expect(jobId2).toBeTruthy()
    // Idempotent: jobId が同一 (再利用)
  expect(jobId1).toBe(jobId2)

    // DB 側でも novelId に紐づく処理中ジョブが 1 件である
    const jobs = await db.jobs().getJobsByNovelId(novelId)
    const active = jobs.filter(j => ['processing','paused','pending'].includes(j.status))
    expect(active.length).toBe(1)
  })
})
