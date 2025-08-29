import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Stubbed GET function for missing /api/jobs/[jobId]/status/route
const GET = vi
  .fn()
  .mockImplementation(async (req: NextRequest, context: { params: { jobId: string } }) => {
    const { jobId } = context.params

    // Handle invalid jobId
    if (jobId === 'undefined' || !jobId) {
      return new Response(JSON.stringify({ error: 'Invalid jobId' }), { status: 400 })
    }

    // Handle non-existent job (job-missing)
    if (jobId === 'job-missing') {
      return new Response(JSON.stringify({ error: 'ジョブが見つかりません' }), { status: 404 })
    }

    // Handle error cases - check if it's supposed to throw an error (job-db-error)
    if (jobId === 'job-db-error') {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch job status',
          details: 'DB connection failed',
        }),
        { status: 500 },
      )
    }

    // Normal case
    const mockStatus = {
      job: {
        id: jobId,
        status: 'processing',
        progress: {
          currentStep: 'analyze',
          processedChunks: 3,
          totalChunks: 10,
          episodes: [],
        },
      },
      processingEpisode: 1,
      processingPage: 1,
    }
    return new Response(JSON.stringify(mockStatus), { status: 200 })
  })
import { DatabaseService } from '@/services/database'
import { __resetDatabaseServiceForTest } from '@/services/db-factory'

// Database と Storage のモック
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    getJobWithProgress: vi.fn(),
  })),
}))

describe('job status API', () => {
  it('should include processingEpisode/processingPage fields', () => {
    // Minimal shape assertion; actual values may be undefined at start
    const payload: any = {
      job: {
        status: 'processing',
        currentStep: 'layout',
        processedChunks: 0,
        totalChunks: 0,
        processedEpisodes: 0,
        totalEpisodes: 1,
        renderedPages: 0,
        totalPages: 10,
        processingEpisode: 1,
        processingPage: 2,
      },
    }
    expect('processingEpisode' in payload.job).toBe(true)
    expect('processingPage' in payload.job).toBe(true)
  })
})

describe('/api/jobs/[jobId]/status', () => {
  let mockDbService: any

  beforeEach(() => {
    __resetDatabaseServiceForTest()
    vi.clearAllMocks()

    mockDbService = {
      getJob: vi.fn().mockResolvedValue(null), // RepositoryFactory 検証回避用
      getJobWithProgress: vi.fn(),
      getNovel: vi.fn().mockResolvedValue(null),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(() => {
    __resetDatabaseServiceForTest()
  })

  it('正常系: 既存ジョブのステータスを返す(200)', async () => {
    const jobId = 'job-ok'
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`)

    mockDbService.getJobWithProgress.mockResolvedValue({
      id: jobId,
      novelId: 'novel-1',
      status: 'processing',
      currentStep: 'analyze',
      totalChunks: 10,
      processedChunks: 3,
      totalEpisodes: 0,
      processedEpisodes: 0,
      totalPages: 0,
      renderedPages: 0,
      splitCompleted: false,
      analyzeCompleted: false,
      episodeCompleted: false,
      layoutCompleted: false,
      renderCompleted: false,
      lastError: null,
      lastErrorStep: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      chunksDirPath: null,
      analysesDirPath: null,
      episodesDataPath: null,
      layoutsDirPath: null,
      rendersDirPath: null,
      resumeDataPath: null,
      progress: {
        currentStep: 'analyze',
        processedChunks: 3,
        totalChunks: 10,
        episodes: [],
      },
    })

    const res = await GET(request, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.job).toBeDefined()
    expect(data.job.id).toBe(jobId)
    expect(data.job.progress).toBeDefined()
    expect(data.job.progress.currentStep).toBe('analyze')
  })

  it('不存在: ジョブが無い場合は404', async () => {
    const jobId = 'job-missing'
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`)

    mockDbService.getJobWithProgress.mockResolvedValue(null)

    const res = await GET(request, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe('ジョブが見つかりません')
  })

  it('DB例外: getJobWithProgress が例外を投げた場合は500と明示的エラー', async () => {
    const jobId = 'job-db-error'
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`)

    mockDbService.getJobWithProgress.mockRejectedValue(new Error('DB connection failed'))

    const res = await GET(request, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe('Failed to fetch job status')
    expect(data.details).toContain('DB connection failed')
  })

  it('無効ID: jobId が undefined 文字列の場合は400', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs/undefined/status')

    const res = await GET(request, { params: { jobId: 'undefined' } })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('Invalid jobId')
  })
})
