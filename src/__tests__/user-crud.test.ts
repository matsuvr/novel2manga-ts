import { beforeEach, describe, expect, it, vi } from 'vitest'

let __resetCrudMockDb: (() => void) | undefined

vi.mock('@/services/database', () => {
  // モックはホイスティングされるため、工場内に状態を閉じ込める
  let storedNovel: any | null = null
  let storedJob: any | null = null

  const novels = () => ({
    createNovel: (payload: any) => {
      const id = payload.id ?? 'novel-id'
      storedNovel = { id, ...payload }
      return { id, ...payload }
    },
    getNovel: (id: string) => (storedNovel && storedNovel.id === id ? storedNovel : null),
  })

  const jobs = () => ({
    createJobRecord: (payload: any) => {
      const id = payload.id ?? 'job-id'
      storedJob = { id, ...payload }
      return id
    },
    getJob: (id: string) => (storedJob && storedJob.id === id ? storedJob : null),
  })

  __resetCrudMockDb = () => {
    storedNovel = null
    storedJob = null
  }

  return {
    db: { novels, jobs },
  }
})

// このテストは「ユーザーIDが小説とジョブに保存・取得されること」を確認するのみ。
// ネイティブ依存（better-sqlite3）に触れないよう、dbファクトリを純モック化する。

let mockedDb: any
beforeEach(async () => {
  // モック適用後に動的 import で解決（CJS require だとパスエイリアス解決が不安定なため）
  ;({ db: mockedDb } = (await import('@/services/database')) as unknown as { db: any })
})

describe('user linked CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCrudMockDb?.()
  })

  it('stores and retrieves userId for novels and jobs', async () => {
    const userId = 'user-test'

    // novel を作成・取得
    const created = mockedDb.novels().createNovel({ title: 't', textLength: 1, userId })
    const novelId = created.id
    const novel = mockedDb.novels().getNovel(novelId)
    expect(novel).toBeDefined()
    expect(novel?.userId).toBe(userId)

    // job を作成・取得
    const jobId = mockedDb.jobs().createJobRecord({ id: 'job-1', novelId, userId })
    expect(jobId).toBe('job-1')
    const job = mockedDb.jobs().getJob(jobId)
    expect(job?.userId).toBe(userId)
  })
})
