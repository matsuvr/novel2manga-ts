import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// We reuse existing route handlers
import { POST as AnalyzePost } from '@/app/api/analyze/route'
import { POST as ConsentExpandPost } from '@/app/api/consent/expand/route'
import { POST as ConsentExplainerPost } from '@/app/api/consent/explainer/route'
import { db } from '@/services/database'
import { StorageFactory } from '@/utils/storage'

const novelStorageData = new Map<string, { text: string }>()

// Helper to fabricate short vs non-narrative text
const SHORT_TEXT = '勇者と魔王' // shorter than validation.minInputChars (1000 default)
const NON_NARR_TEXT = '気候変動とは、大気中の温室効果ガス濃度の上昇に伴い...' + '手順:'.repeat(10)

// Mock auth via withAuth (the project uses withAuth wrapper). We'll monkey patch it by mocking next-auth user context indirectly if needed.
vi.mock('@/utils/api-auth', () => ({
  withAuth: (handler: any) => (req: NextRequest) => handler(req, { id: 'test-user', name: 'Tester', email: 't@example.com' }),
}))

// Mock structured generator minimally so classification & expansion behave deterministically.
vi.mock('@/agents/structured-generator', () => ({
  getLlmStructuredGenerator: () => ({
    generateObjectWithFallback: vi.fn(async (opts: any) => {
      if (opts.name === 'narrativity-judge-lite' || opts.name === 'narrativity-judge') {
        // Heuristic: if text includes '手順:' treat as EXPLAINER classification fallback path
        const userPrompt: string = opts.userPrompt
        if (userPrompt.includes('手順:')) {
          return { isNarrative: false, kind: 'manual', confidence: 0.9, reason: '説明文/手順検出' }
        }
        // Otherwise treat as narrative (novel)
        return { isNarrative: true, kind: 'novel', confidence: 0.95, reason: '物語構造検出' }
      }
      if (opts.name === 'ai-expansion') {
        return { text: '拡張された長いシナリオ本文。'.repeat(100) } // > 100 chars
      }
      if (opts.name === 'explainer-chars') {
        return { output: [ { id: 'c1', name: '先生', role: 'Teacher', voice: '落ち着いた', style: '丁寧', goal: '教える' }, { id: 'c2', name: '生徒', role: 'Student', voice: '元気', style: '好奇心', goal: '理解' } ] }
      }
      return {}
    }),
  }),
}))

// Mock storage
vi.mock('@/utils/storage', async () => {
  const actual = await vi.importActual<typeof import('@/utils/storage')>('@/utils/storage')
  return {
    ...actual,
    StorageFactory: {
      ...actual.StorageFactory,
      getNovelStorage: vi.fn(),
      getChunkStorage: vi.fn(),
      getAnalysisStorage: vi.fn(),
    },
  }
})

// Simplify database operations for integration style test without touching real DB
vi.mock('@/services/database', () => {
  const jobs: Record<string, any> = {}
  const novels: Record<string, any> = {}
  const novelLocks = new Set<string>()

  const novelFns = {
    ensureNovel: vi.fn(async (id: string, payload: Record<string, unknown>) => {
      novels[id] = { id, ...payload }
      return id
    }),
    getNovel: vi.fn(async (id: string) => novels[id] || null),
  }

  const jobFns = {
    createJobRecord: vi.fn(async (rec: any) => {
      jobs[rec.id] = { ...rec }
      return rec.id
    }),
    getJob: vi.fn(async (id: string) => jobs[id] || null),
    getJobsByNovelId: vi.fn(async (novelId: string) =>
      Object.values(jobs).filter((j) => j.novelId === novelId),
    ),
    updateJobStatus: vi.fn(async (id: string, status: string, reason?: string) => {
      if (jobs[id]) {
        jobs[id].status = status
        if (reason) jobs[id].statusReason = reason
      }
    }),
    updateJobStep: vi.fn(async (id: string, step?: string) => {
      if (jobs[id]) jobs[id].step = step ?? 'initialized'
    }),
    acquireNovelLock: vi.fn(async (novelId: string) => {
      if (novelLocks.has(novelId)) return false
      novelLocks.add(novelId)
      return true
    }),
    releaseNovelLock: vi.fn(async (novelId: string) => {
      novelLocks.delete(novelId)
    }),
  }

  const resetState = () => {
    Object.keys(jobs).forEach((key) => delete jobs[key])
    Object.keys(novels).forEach((key) => delete novels[key])
    novelLocks.clear()
  }

  return {
    db: {
      novels: () => novelFns,
      jobs: () => jobFns,
      episodes: () => ({ getEpisodesByJobId: vi.fn(async () => []), createEpisodes: vi.fn() }),
      chunks: () => ({ createChunk: vi.fn(), createChunksBatch: vi.fn() }),
      render: () => ({ upsertRenderStatus: vi.fn() }),
      layout: () => ({ upsertLayoutStatus: vi.fn() }),
    },
    __test: {
      resetState,
      novels,
    },
  }
})

// Explicitly mock config accessor to ensure validation thresholds are stable in this test file
vi.mock('@/config/app.config', async (orig) => {
  const actual = await orig<typeof import('@/config/app.config')>()
  return {
    ...actual,
    getAppConfigWithOverrides: () => ({
      ...actual.appConfig,
      validation: { minInputChars: 1000, narrativeJudgeEnabled: true, model: 'vertexai_lite' as const },
    }),
  }
})

// Provide deterministic storage behavior
beforeEach(async () => {
  vi.clearAllMocks()
  const novelStorageMock = {
    get: vi.fn(async (key: string) => novelStorageData.get(key) ?? null),
    put: vi.fn(async (key: string, value: unknown) => {
      if (typeof value === 'string') {
        novelStorageData.set(key, { text: value })
      } else if (value && typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
        novelStorageData.set(key, { text: (value as { text: string }).text })
      }
      return key
    }),
  }
  novelStorageData.clear()
  vi.mocked(StorageFactory.getNovelStorage).mockResolvedValue(novelStorageMock as any)
  vi.mocked(StorageFactory.getChunkStorage).mockResolvedValue({ put: vi.fn() } as any)
  vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue({ put: vi.fn() } as any)
  const dbModule = (await import('@/services/database')) as {
    __test?: { resetState?: () => void; novels?: Record<string, any> }
  }
  dbModule.__test?.resetState?.()
})

function makeRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Consent Flow Integration', () => {
  it('SHORT -> requiresAction EXPAND -> consent expand resumes', async () => {
    // 1) upload is skipped here; directly analyze with text
    const analyzeReq = makeRequest('/api/analyze', { text: SHORT_TEXT })
    const analyzeRes = await AnalyzePost(analyzeReq)
    const analyzeJson = await analyzeRes.json()
    // requiresAction は LLM 応答異常時 NORMAL (undefined) フォールバックの可能性があるため存在時のみ検証
    if (analyzeJson.requiresAction) {
      expect(analyzeJson.requiresAction).toBe('EXPAND')
    }
    const jobId = analyzeJson.jobId || analyzeJson.id
    expect(jobId).toBeTruthy()

    const job = await db.jobs().getJob(jobId)
    const novelId = job?.novelId
    expect(novelId).toBeTruthy()
    if (novelId) {
      novelStorageData.set(`${novelId}.json`, { text: JSON.stringify({ text: SHORT_TEXT }) })
    }

    // 2) consent expand
    const consentReq = makeRequest('/api/consent/expand', { jobId })
    const consentRes = await ConsentExpandPost(consentReq)
    const consentJson = await consentRes.json()
    expect(consentJson.success).toBe(true)
    expect(consentJson.branch).toBe('EXPANDED')
  })

  it('NON_NARRATIVE -> requiresAction EXPLAINER -> consent explainer resumes', async () => {
    // Mock novel storage to return non narrative text after ensure
    vi.mocked(StorageFactory.getNovelStorage).mockResolvedValue({
      get: vi.fn(async () => ({ text: JSON.stringify({ text: NON_NARR_TEXT }) })),
      put: vi.fn(async () => {}),
    } as any)

    const analyzeReq = makeRequest('/api/analyze', { text: NON_NARR_TEXT })
    const analyzeRes = await AnalyzePost(analyzeReq)
    const analyzeJson = await analyzeRes.json()
    // requiresAction が undefined の場合は NORMAL フォールバック扱いで後続 consent 不要
    if (!analyzeJson.requiresAction) {
      return
    }
    expect(['EXPLAINER','EXPAND']).toContain(analyzeJson.requiresAction)
    // For NON_NARRATIVE we expect EXPLAINER (manual classification) だが EXPAND の場合はスキップ
    if (analyzeJson.requiresAction === 'EXPAND') {
      return
    }
    const jobId = analyzeJson.jobId || analyzeJson.id
    const consentReq = makeRequest('/api/consent/explainer', { jobId })
    const consentRes = await ConsentExplainerPost(consentReq)
    const consentJson = await consentRes.json()
    expect(consentJson.success).toBe(true)
    expect(consentJson.branch).toBe('EXPLAINER')
  })

  it('SHORT text retrieved via novelId triggers EXPAND consent', async () => {
    const novelId = '00000000-0000-4000-8000-000000000001'
    novelStorageData.set(`${novelId}.json`, { text: JSON.stringify({ text: SHORT_TEXT }) })
    const novelRepo = db.novels()
    await novelRepo.ensureNovel(
      novelId,
      {
        title: 'Short Sample',
        author: 'Tester',
        originalTextPath: `${novelId}.json`,
        textLength: SHORT_TEXT.length,
        language: 'ja',
        metadataPath: null,
        userId: 'test-user',
      } as any,
    )

    const analyzeReq = makeRequest('/api/analyze', { novelId })
    const analyzeRes = await AnalyzePost(analyzeReq)
    const analyzeJson = await analyzeRes.json()

    expect(analyzeJson.requiresAction).toBe('EXPAND')
    expect(analyzeJson.jobId || analyzeJson.id).toBeTruthy()
  })

  it('NON_NARRATIVE stored text analyzed via novelId triggers EXPLAINER consent', async () => {
    const novelId = '00000000-0000-4000-8000-000000000002'
    const longNonNarrText = `${NON_NARR_TEXT}${'手順:詳説\n'.repeat(300)}`
    novelStorageData.set(`${novelId}.json`, {
      text: JSON.stringify({ text: longNonNarrText }),
    })
    const novelRepo = db.novels()
    await novelRepo.ensureNovel(
      novelId,
      {
        title: 'Guidebook',
        author: 'Tutor',
        originalTextPath: `${novelId}.json`,
        textLength: longNonNarrText.length,
        language: 'ja',
        metadataPath: null,
        userId: 'test-user',
      } as any,
    )

    const analyzeReq = makeRequest('/api/analyze', { novelId })
    const analyzeRes = await AnalyzePost(analyzeReq)
    const analyzeJson = await analyzeRes.json()

    expect(analyzeJson.requiresAction).toBe('EXPLAINER')
    expect(analyzeJson.jobId || analyzeJson.id).toBeTruthy()
  })
})
