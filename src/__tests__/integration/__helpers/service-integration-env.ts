import { vi } from 'vitest'
import { users } from '@/db/schema'
import { TestStorageDataFactory, TestStorageFactory } from '../__helpers/test-storage'
import { resetAgentMocks, setupAgentMocks, TEST_CHUNK_ANALYSIS, TEST_EPISODE_CONFIG } from './test-agents'
import { cleanupTestDatabase, createTestDatabase, type TestDatabase, TestDataFactory } from './test-database'

export interface ServiceIntegrationContext {
  testDb: TestDatabase
  dataFactory: TestDataFactory
  storageFactory: TestStorageFactory
  storageDataFactory: TestStorageDataFactory
  AnalyzePipeline?: any
}

/**
 * 共通の beforeEach 初期化処理をまとめるヘルパー
 */
export async function setupServiceIntegration(): Promise<ServiceIntegrationContext> {
  const testDb = await createTestDatabase()
  const dataFactory = new TestDataFactory(testDb.db)
  const storageFactory = new TestStorageFactory()
  const storageDataFactory = new TestStorageDataFactory(storageFactory)

  // DatabaseService モック
  vi.doMock('@/services/database', () => ({
    DatabaseService: vi.fn(() => testDb.service),
    // AnalyzePipeline が直接呼ぶ可能性のあるショートカットメソッドを明示再エクスポート
    createNovel: (...args: any[]) => (testDb.service as any).createNovel(...args),
    ensureNovel: (...args: any[]) => (testDb.service as any).ensureNovel(...args),
    db: {
      novels: () => ({
        getNovel: vi.fn((id: string) => (testDb.service as any).getNovel(id)),
        // DB接続エラーを回避するため ensureNovel はテストでは no-op（成功扱い）
        ensureNovel: vi.fn(async (_id: string, _payload: any) => {}),
        createNovel: vi.fn(async (payload: any) => testDb.service.createNovel(payload)),
      }),
      jobs: () => ({
        createJobRecord: vi.fn((payload: any) => testDb.service.createJob(payload)),
        updateJobStatus: vi.fn((id: string, status: any, error?: string) => testDb.service.updateJobStatus(id, status, error)),
        updateJobStep: vi.fn((id: string, step: any) => (testDb.service as any).updateJobStep?.(id, step)),
        markJobStepCompleted: vi.fn((id: string, step: any) => (testDb.service as any).markJobStepCompleted?.(id, step)),
        updateJobTotalPages: vi.fn((id: string, totalPages: number) => (testDb.service as any).updateJobTotalPages?.(id, totalPages)),
        getJobWithProgress: vi.fn((id: string) => testDb.service.getJobWithProgress(id)),
        getJob: vi.fn((id: string) => testDb.service.getJob(id)),
      }),
      episodes: () => ({
        getEpisodesByJobId: vi.fn((jobId: string) => testDb.service.getEpisodesByJobId(jobId)),
        createEpisodes: vi.fn((episodes: any[]) => testDb.service.createEpisodes(episodes)),
      }),
      chunks: () => ({
        createChunk: vi.fn((payload: any) => testDb.service.createChunk(payload)),
      }),
      chunkConversion: () => ({
        getStatusesByJob: vi.fn(async () => []),
        ensureStatuses: vi.fn(async () => {}),
        markProcessing: vi.fn(async () => {}),
        markCompleted: vi.fn(async () => {}),
        markFailed: vi.fn(async () => {}),
      }),
      render: () => ({
        getAllRenderStatusByJob: vi.fn(() => []),
      }),
    },
    getDatabaseServiceFactory: vi.fn(),
    initializeDatabaseServiceFactory: vi.fn(),
    isFactoryInitialized: vi.fn(() => true),
    cleanup: vi.fn(),
  }))

  vi.doMock('@/services/db-factory', () => ({
    __resetDatabaseServiceForTest: vi.fn(),
    getDatabaseService: vi.fn(() => testDb.service),
  }))

  vi.doMock('@/db', () => ({ getDatabase: vi.fn(() => testDb.db) }))

  setupAgentMocks()

  // chunk-analyzer 安定化
  vi.doMock('@/agents/chunk-analyzer', () => ({
    getChunkAnalyzerAgent: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        result: TEST_CHUNK_ANALYSIS,
      }),
    }),
    analyzeChunkWithFallback: vi.fn(async () => ({
      result: TEST_CHUNK_ANALYSIS,
      usedProvider: 'test-provider',
      fallbackFrom: [],
    })),
  }))

  vi.doMock('@/config', () => ({
    getAppConfigWithOverrides: vi.fn(() => ({
      chunking: { defaultChunkSize: 3000, defaultOverlapSize: 200 },
      processing: {
        maxConcurrentChunks: 3,
        batchSize: { chunks: 5 },
        episode: { targetCharsPerEpisode: 10000, minCharsPerEpisode: 5000, maxCharsPerEpisode: 20000 },
      },
      features: { enableParallelProcessing: true },
      llm: {
        chunkConversion: { systemPrompt: 'Chunk conversion system prompt', userPromptTemplate: 'チャンク変換: {{chunkText}}' },
        episodeBreakEstimation: { systemPrompt: 'episode-break system', userPromptTemplate: '【統合スクリプト】\n{{scriptJson}}\nEND' },
      },
    })),
    getChunkConversionConfig: vi.fn(() => ({ provider: 'openai', maxTokens: 1000, systemPrompt: 'Chunk conversion system prompt', userPromptTemplate: 'チャンク変換: {{chunkText}}' })),
    getChunkingConfig: vi.fn(() => ({ defaultChunkSize: 150, defaultOverlapSize: 30, maxChunkSize: 10000, minChunkSize: 50, maxOverlapRatio: 0.5 })),
    getLLMProviderConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'test-model', maxTokens: 1000 })),
    getLLMDefaultProvider: vi.fn(() => 'openai'),
    getEpisodeConfig: vi.fn(() => TEST_EPISODE_CONFIG),
    getDatabaseConfig: vi.fn(() => ({ sqlite: { path: ':memory:' } })),
    getLayoutGenerationConfig: vi.fn(() => ({ provider: 'openai', maxTokens: 1000, systemPrompt: 'テスト用レイアウト生成プロンプト' })),
    getPageBreakEstimationConfig: vi.fn(() => ({ provider: 'openai', maxTokens: 1000, systemPrompt: 'ページ切れ目推定system', userPromptTemplate: 'avgLinesPerPage={{avgLinesPerPage}}; avgCharsPerLine={{avgCharsPerLine}}; episodeSummary={{episodeSummary}}; chunkSnippets={{chunkSnippets}}' })),
    isDevelopment: vi.fn(() => true),
  }))

  vi.doMock('@/agents/script/page-break-estimator', () => ({
    estimatePageBreaks: vi.fn().mockResolvedValue({
      pages: [ { pageNumber: 1, panelCount: 3, panels: [ { panelIndex: 1, content: 'c1', dialogue: [] }, { panelIndex: 2, content: 'c2', dialogue: [] }, { panelIndex: 3, content: 'c3', dialogue: [] } ] } ],
    }),
  }))

  vi.doMock('@/agents/script/panel-assignment', () => ({
    assignPanels: vi.fn().mockResolvedValue({
      pages: [ { pageNumber: 1, panelCount: 3, panels: [ { id: 1, scriptIndexes: [1] }, { id: 2, scriptIndexes: [2] }, { id: 3, scriptIndexes: [3] } ] } ],
    }),
    buildLayoutFromAssignment: vi.fn().mockReturnValue({
      pages: [ { id: 1, panels: [ { id: 'panel-1', content: { text: 'p1' } }, { id: 'panel-2', content: { text: 'p2' } }, { id: 'panel-3', content: { text: 'p3' } } ] } ],
    }),
  }))

  // デフォルトユーザー挿入
  await testDb.db.insert(users).values({ id: 'test-user-bypass', name: 'Test User', email: `test-${Date.now()}@example.com` }).onConflictDoNothing()

  // PageBreakStep override
  vi.doMock('@/services/application/steps', async () => {
    const actual = await vi.importActual<any>('@/services/application/steps')
    return {
      ...actual,
      PageBreakStep: class {
        readonly stepName = 'page-break'
        async estimatePageBreaks() {
          return {
            success: true,
            data: {
              pageBreakPlan: { pages: [ { pageNumber: 1, panelCount: 2, panels: [ { panelIndex: 1, content: 'demo-1', dialogue: [] }, { panelIndex: 2, content: 'demo-2', dialogue: [] } ] } ] },
              totalPages: 2,
            },
          }
        }
      },
    }
  })

  // script-converter を先にモックしてから import（vitest は ESM キャッシュを考慮）
  vi.doMock('@/agents/script/script-converter', () => ({
    convertChunkToMangaScript: vi.fn(),
    convertEpisodeTextToScript: vi.fn(),
  }))
  const { convertEpisodeTextToScript, convertChunkToMangaScript } = await import('@/agents/script/script-converter')
  ;(convertChunkToMangaScript as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    style_tone: 'テスト用トーン',
    style_art: 'テスト用アート',
    style_sfx: 'テスト用効果音',
    characters: [ { id: 'char_1', name_ja: '太郎', role: 'protagonist', speech_style: 'カジュアル', aliases: ['太郎'] } ],
    locations: [ { id: 'loc_1', name_ja: 'テスト場所', notes: 'テスト用場所' } ],
    props: [],
    panels: [
      { no: 1, cut: 'テスト舞台設定', camera: 'medium', importance: 1, dialogue: [] },
      { no: 2, cut: 'テストセリフ', camera: 'close', importance: 1, dialogue: [ { text: 'テストセリフ', type: 'speech', speaker: '太郎' } ] },
    ],
    continuity_checks: [],
  })
  ;(convertEpisodeTextToScript as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    style_tone: 'テスト用トーン',
    style_art: 'テスト用アート',
    style_sfx: 'テスト用効果音',
    characters: [ { id: 'char_1', name_ja: '太郎', role: 'protagonist', speech_style: 'カジュアル', aliases: ['太郎'] } ],
    locations: [ { id: 'loc_1', name_ja: 'テスト場所', notes: 'テスト用場所' } ],
    props: [],
    panels: [
      { no: 1, cut: 'テスト舞台設定', camera: 'medium', importance: 1, dialogue: [] },
      { no: 2, cut: 'テストセリフ', camera: 'close', importance: 1, dialogue: [ { text: 'テストセリフ', type: 'speech', speaker: '太郎' } ] },
    ],
    continuity_checks: [],
  })

  const { AnalyzePipeline } = await import('@/services/application/analyze-pipeline')

  // structured-generator を簡略化モック: 空 userPrompt チェックをバイパスし決定的レスポンスで返す
  vi.doMock('@/agents/structured-generator', async () => {
    return {
      DefaultLlmStructuredGenerator: class {
        constructor(_order?: any[]) {}
        async generateObjectWithFallback<T>(args: any): Promise<T> {
          // episodeBreakEstimation など schema に合わせた最小限のダミーデータ
          if (args.schemaName === 'EpisodeBreakPlan') {
            return {
              episodes: [
                {
                  episodeNumber: 1,
                  title: 'Episode 1',
                  description: 'Mocked episode',
                  startPanelIndex: 1,
                  endPanelIndex: 2,
                },
              ],
            } as unknown as T
          }
          if (args.schemaName === 'CoverageAssessment') {
            return {
              coverageRatio: 0.9,
              missingPoints: [],
              overSummarized: false,
            } as unknown as T
          }
          // デフォルトは空オブジェクト
            return {} as T
        }
      },
      getLlmStructuredGenerator: () => ({
        generateObjectWithFallback: async (_cfg: any) => ({ coverageRatio: 0.95, missingPoints: [], overSummarized: false }),
      }),
    }
  })

  // transaction-manager: executeStorageWithTracking を軽量化
  vi.doMock('@/services/application/transaction-manager', () => ({
    executeStorageWithTracking: vi.fn(async ({ storage, key, value }) => {
      await storage.put(key, value, { contentType: 'application/json' })
    }),
  }))

  // 念のため EpisodeBreakEstimationStep 内部が直接 app.config.ts を参照する経路に備え、同モジュールを後追いで import した後も
  // 空 userPrompt にならないよう最低限の episodeBreak 設定が存在することを確認する（本番設定との差分はテスト簡略化目的）
  try {
    const cfg = (await import('@/config')).getAppConfigWithOverrides()
    if (!cfg.llm?.episodeBreakEstimation?.userPromptTemplate) {
      ;(cfg as any).llm.episodeBreakEstimation = {
        systemPrompt: 'episode-break system',
        userPromptTemplate: '【統合スクリプト】\n{{scriptJson}}',
      }
    }
  } catch (_) {
    // ここでの失敗はテスト継続に致命的でないため無視
  }

  return { testDb, dataFactory, storageFactory, storageDataFactory, AnalyzePipeline }
}

/** afterEach 用クリーンアップ */
export async function teardownServiceIntegration(ctx: ServiceIntegrationContext | undefined) {
  if (!ctx) return
  try {
    resetAgentMocks()
    ctx.storageFactory?.clearAll?.()
    await cleanupTestDatabase(ctx.testDb)
  } finally {
    vi.clearAllMocks()
    vi.resetAllMocks()
  }
}
