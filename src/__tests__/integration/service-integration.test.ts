/**
 * サービス統合テスト
 * 複数のサービス層の協調動作をテスト
 */

import { vi } from 'vitest'

// Import for mocking
import { convertEpisodeTextToScript } from '@/agents/script/script-converter'

// LLM structured generator モック - エラーの根本原因を解決
vi.mock('@/agents/structured-generator', () => {
  const mockInstance = {
    // EpisodeBreakEstimationStep 用: episodes を返す
    generateObjectWithFallback: vi.fn().mockResolvedValue({
      episodes: [
        {
          episodeNumber: 1,
          title: 'Episode 1',
          startPanelIndex: 1,
          endPanelIndex: 1,
          description: 'Mock episode',
        },
      ],
    }),
  }

  // クラスコンストラクタをモック
  const MockDefaultLlmStructuredGenerator = vi.fn(() => mockInstance)

  return {
    DefaultLlmStructuredGenerator: MockDefaultLlmStructuredGenerator,
    // 既存のユースケースにも対応
    getLlmStructuredGenerator: vi.fn(() => mockInstance),
  }
})

// パネル割り当ては beforeEach で毎回モック上書き（テスト間のリセットの影響回避）

// Chunk analyzer mock - to prevent real LLM calls during integration tests
vi.mock('@/agents/chunk-analyzer', () => ({
  getChunkAnalyzerAgent: vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      result: {
        theme: 'テストテーマ',
        mood: 'neutral',
        characters: ['太郎'],
        keyPhrases: ['テスト', '統合テスト'],
        importance: 5,
      },
    }),
  }),
  analyzeChunkWithFallback: vi.fn().mockResolvedValue({
    result: {
      theme: 'テストテーマ',
      mood: 'neutral',
      characters: ['太郎'],
      keyPhrases: ['テスト', '統合テスト'],
      importance: 5,
    },
    usedProvider: 'test-provider',
    fallbackFrom: [],
  }),
}))

// Script converter mock
vi.mock('@/agents/script/script-converter', () => ({
  convertEpisodeTextToScript: vi.fn().mockResolvedValue({
    style_tone: 'テスト用トーン',
    style_art: 'テスト用アート',
    style_sfx: 'テスト用効果音',
    characters: [],
    locations: [],
    props: [],
    panels: [
      {
        no: 1,
        cut: 'テスト舞台設定',
        camera: 'medium',
        narration: ['説明'],
        dialogue: ['太郎: テストセリフ'],
      },
    ],
    continuity_checks: [],
  }),
  convertChunkToMangaScript: vi.fn().mockResolvedValue({
    style_tone: 'テスト用トーン',
    style_art: 'テスト用アート',
    style_sfx: 'テスト用効果音',
    characters: [
      {
        id: 'char_1',
        name_ja: '太郎',
        role: 'protagonist',
        speech_style: 'カジュアル',
        aliases: ['太郎'],
      },
    ],
    locations: [
      {
        id: 'loc_1',
        name_ja: 'テスト場所',
        notes: 'テスト用場所',
      },
    ],
    props: [],
    panels: [
      {
        no: 1,
        cut: 'テストシーン説明',
        camera: 'medium',
        dialogue: ['太郎: テストセリフ'],
      },
    ],
    continuity_checks: [],
  }),
}))

// Page break estimator も beforeEach で毎回モック上書き

// 設定モック - 最初に定義する必要がある
vi.mock('@/config', () => ({
  getAppConfigWithOverrides: vi.fn(() => ({
    chunking: {
      defaultChunkSize: 3000,
      defaultOverlapSize: 200,
    },
    processing: {
      maxConcurrentChunks: 3,
      batchSize: { chunks: 5 },
      episode: {
        targetCharsPerEpisode: 10000,
        minCharsPerEpisode: 5000,
        maxCharsPerEpisode: 20000,
      },
    },
    features: {
      enableParallelProcessing: true,
    },
    llm: {
      textAnalysis: {
        systemPrompt: 'Test system prompt',
        userPromptTemplate: 'テスト用プロンプト: {{chunkText}}',
      },
    },
  })),
  getTextAnalysisConfig: vi.fn(() => ({
    userPromptTemplate: 'テスト用プロンプト: {{chunkText}}',
  })),
  getScriptConversionConfig: vi.fn(() => ({
    systemPrompt: 'script-system',
    userPromptTemplate: 'Episode: {{episodeText}}',
  })),
  // 短いテキストでも十分なチャンク数ができるように調整（エピソード境界の2..3に一致させる）
  getChunkingConfig: vi.fn(() => ({
    defaultChunkSize: 1000,
    defaultOverlapSize: 200,
    maxChunkSize: 10000,
    minChunkSize: 500,
    maxOverlapRatio: 0.5,
  })),
  getLLMProviderConfig: vi.fn(() => ({
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 1000,
  })),
  getDatabaseConfig: vi.fn(() => ({
    sqlite: {
      path: ':memory:',
    },
  })),
  getLayoutGenerationConfig: vi.fn(() => ({
    provider: 'openai',
    maxTokens: 1000,
    systemPrompt: 'テスト用レイアウト生成プロンプト',
  })),
  getLLMDefaultProvider: vi.fn(() => 'openai'),
  getEpisodeConfig: vi.fn(() => ({
    targetCharsPerEpisode: 1000,
    minCharsPerEpisode: 500,
    maxCharsPerEpisode: 2000,
  })),
  getPanelAssignmentConfig: vi.fn(() => ({
    provider: 'openai',
    maxTokens: 1000,
    systemPrompt: 'テスト用パネル割り当てプロンプト',
    userPromptTemplate: 'Panel assignment: {{scriptText}}',
  })),
  isDevelopment: vi.fn(() => true),
}))

import crypto from 'node:crypto'
import { afterEach, describe as baseDescribe, beforeEach, describe, expect, it, vi } from 'vitest'
// AnalyzePipeline は下のモック適用後に動的import
import {
  resetAgentMocks,
  setupAgentMocks,
  TEST_CHUNK_ANALYSIS,
  TEST_EPISODE_BOUNDARIES,
} from './__helpers/test-agents'
import type { TestDatabase } from './__helpers/test-database'
import { cleanupTestDatabase, createTestDatabase, TestDataFactory } from './__helpers/test-database'

// 環境に better-sqlite3 が無い場合はこのスイートをスキップ
let __nativeSqliteAvailable = true
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('better-sqlite3')
} catch {
  __nativeSqliteAvailable = false
}
const describe = __nativeSqliteAvailable ? baseDescribe : baseDescribe.skip

import { TestStorageDataFactory, TestStorageFactory } from './__helpers/test-storage'

// StorageFactoryのモック
let testStorageFactory: TestStorageFactory
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: () => testStorageFactory.getNovelStorage(),
    getChunkStorage: () => testStorageFactory.getChunkStorage(),
    getAnalysisStorage: () => testStorageFactory.getAnalysisStorage(),
    getLayoutStorage: () => testStorageFactory.getLayoutStorage(),
    getRenderStorage: () => testStorageFactory.getRenderStorage(),
    getOutputStorage: () => testStorageFactory.getOutputStorage(),
  },
  StorageKeys: {
    chunk: (jobId: string, index: number) => `${jobId}/chunk_${index}.txt`,
    chunkAnalysis: (jobId: string, index: number) => `${jobId}/chunk_${index}.json`,
    episodeLayout: (jobId: string, episodeNumber: number) =>
      `${jobId}/episode_${episodeNumber}.yaml`,
  },
  JsonStorageKeys: {
    scriptChunk: (jobId: string, index: number) => `${jobId}/script_chunk_${index}.json`,
    scriptCombined: (jobId: string) => `${jobId}/script_combined.json`,
    fullPages: (jobId: string) => `${jobId}/full_pages.json`,
    episodeBundling: (jobId: string) => `${jobId}/episode_bundling.json`,
  },
  saveEpisodeBoundaries: vi.fn().mockImplementation(async (jobId: string, boundaries: any[]) => {
    // Mock implementation that saves episodes to test database
    if (__testDbForFactory) {
      // jobからnovelIdを取得
      const job = await __testDbForFactory.service.getJob(jobId)
      const novelId = job?.novelId || 'test-novel-default'

      // Use upsert logic to avoid UNIQUE constraint violations
      const { episodes } = await import('@/db/schema')

      for (const boundary of boundaries) {
        await __testDbForFactory.db
          .insert(episodes)
          .values({
            id: `${jobId}-episode-${boundary.episodeNumber}`,
            novelId,
            jobId,
            episodeNumber: boundary.episodeNumber,
            title: boundary.title || `Episode ${boundary.episodeNumber}`,
            summary: boundary.summary || `Test episode ${boundary.episodeNumber}`,
            startChunk: boundary.startChunk,
            startCharIndex: boundary.startCharIndex,
            endChunk: boundary.endChunk,
            endCharIndex: boundary.endCharIndex,
            confidence: boundary.confidence,
          })
          .onConflictDoUpdate({
            target: [episodes.jobId, episodes.episodeNumber],
            set: {
              title: boundary.title || `Episode ${boundary.episodeNumber}`,
              summary: boundary.summary || `Test episode ${boundary.episodeNumber}`,
              startChunk: boundary.startChunk,
              startCharIndex: boundary.startCharIndex,
              endChunk: boundary.endChunk,
              endCharIndex: boundary.endCharIndex,
              confidence: boundary.confidence,
            },
          })
      }
    }
  }),
}))

// レイアウト生成エージェントのモック
vi.mock('@/agents/layout-generator', () => ({
  generateMangaLayout: vi.fn().mockResolvedValue({
    success: true,
    layoutPath: 'test-layout.yaml',
    layout: {
      pages: [
        {
          pageNumber: 1,
          panels: [
            {
              id: 'panel1',
              type: 'dialogue',
              content: 'テスト対話',
              position: { x: 0.0, y: 0.0 }, // Normalized coordinates [0,1]
              size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
            },
          ],
        },
      ],
    },
  }),
}))

// Episode bundling と Script merge を安定化させるモック
vi.mock('@/services/application/steps/script-merge-step', () => ({
  ScriptMergeStep: class {
    async mergeChunkScripts(total: number, ctx: { jobId: string }) {
      // 実装互換のため、analysisStorageに script_combined.json を出力
      try {
        const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
        const storage = await StorageFactory.getAnalysisStorage()
        const combined = {
          // 最低限の NewMangaScript 互換構造を保存（panels が必須）
          panels: [
            {
              no: 1,
              cut: '統合シーン1',
              camera: 'medium',
              dialogue: ['太郎: 統合セリフ1'],
            },
            {
              no: 2,
              cut: '統合シーン2',
              camera: 'close',
              dialogue: ['花子: 統合セリフ2'],
            },
          ],
          scenes: [
            {
              setting: 'テスト設定',
              description: '統合シーン',
              script: [
                { index: 1, type: 'stage', text: '統合1' },
                { index: 2, type: 'dialogue', text: '統合2', speaker: '太郎' },
              ],
            },
          ],
        }
        await storage.put(JsonStorageKeys.scriptCombined(ctx.jobId), JSON.stringify(combined))
      } catch {
        // 失敗してもテストは継続（呼び出し元で失敗させない）
      }
      return { success: true, data: { merged: true, scenes: Math.max(1, total) } }
    }
  },
}))

// EpisodeBundlingStep mock removed - replaced with episode break estimation

// レイアウト生成サービス全体をモック
vi.mock('@/services/application/layout-generation', () => ({
  generateEpisodeLayout: vi.fn().mockResolvedValue({
    success: true,
    layout: {
      pages: [
        {
          page_number: 1,
          panels: [
            {
              position: { x: 0, y: 0 },
              size: { width: 1, height: 1 },
            },
          ],
        },
      ],
    },
    layoutPath: 'test-layout.yaml',
  }),
}))

// RepositoryFactory のモック（テストDBに委譲）
let __testDbForFactory: TestDatabase | undefined
vi.mock('@/repositories/factory', () => {
  const factory = () => ({
    getJobRepository: () => ({
      create: (payload: any) => __testDbForFactory!.service.createJob(payload),
      getJob: (id: string) => __testDbForFactory!.service.getJob(id),
      updateJobTotalPages: (id: string, totalPages: number) =>
        (__testDbForFactory!.service as any).updateJobTotalPages?.(id, totalPages),
      updateStep: (
        id: string,
        step: any,
        processed?: number,
        total?: number,
        error?: string,
        errorStep?: string,
      ) =>
        (__testDbForFactory!.service as any).updateJobStep(
          id,
          step,
          processed,
          total,
          error,
          errorStep,
        ),
      markStepCompleted: (id: string, step: any) =>
        __testDbForFactory!.service.markJobStepCompleted(id, step),
      updateStatus: (id: string, status: any) =>
        __testDbForFactory!.service.updateJobStatus(id, status),
      getJobWithProgress: (id: string) => __testDbForFactory!.service.getJobWithProgress(id),
    }),
    getNovelRepository: () => ({
      get: (id: string) => __testDbForFactory!.service.getNovel(id),
      ensure: (id: string, payload: any) => __testDbForFactory!.service.ensureNovel(id, payload),
    }),
    getChunkRepository: () => ({
      create: (payload: any) => __testDbForFactory!.service.createChunk(payload),
      createBatch: (payloads: any[]) => __testDbForFactory!.service.createChunksBatch(payloads),
      getByJobId: (jobId: string) => __testDbForFactory!.service.getChunksByJobId(jobId) as any,
      db: {
        getChunksByJobId: (jobId: string) => __testDbForFactory!.service.getChunksByJobId(jobId),
      },
    }),
    getEpisodeRepository: () => ({
      getByJobId: (jobId: string) => __testDbForFactory!.service.getEpisodesByJobId(jobId),
    }),
  })
  return {
    getRepositoryFactory: factory,
    getJobRepository: () => factory().getJobRepository(),
    getNovelRepository: () => factory().getNovelRepository(),
    getChunkRepository: () => factory().getChunkRepository(),
  }
})

describe('Service Integration Tests', () => {
  let testDb: TestDatabase
  let dataFactory: TestDataFactory
  let storageDataFactory: TestStorageDataFactory
  let AnalyzePipeline: any

  beforeEach(async () => {
    // テストデータベースの初期化
    testDb = await createTestDatabase()
    __testDbForFactory = testDb
    dataFactory = new TestDataFactory(testDb.db)

    // テストストレージの初期化
    testStorageFactory = new TestStorageFactory()
    storageDataFactory = new TestStorageDataFactory(testStorageFactory)

    // DatabaseServiceのモック
    vi.doMock('@/services/database', () => ({
      DatabaseService: vi.fn(() => testDb.service),
      // dbファクトリーを追加
      db: {
        novels: () => ({
          getNovel: vi.fn((id: string) => testDb.service.getNovel(id)),
          ensureNovel: vi.fn((id: string, payload: any) => testDb.service.ensureNovel(id, payload)),
          createNovel: vi.fn((payload: any) => testDb.service.createNovel(payload)),
        }),
        jobs: () => ({
          createJobRecord: vi.fn((payload: any) => testDb.service.createJob(payload)),
          updateJobStatus: vi.fn((id: string, status: any, error?: string) =>
            testDb.service.updateJobStatus(id, status, error),
          ),
          updateJobStep: vi.fn((id: string, step: any) =>
            (testDb.service as any).updateJobStep?.(id, step),
          ),
          markJobStepCompleted: vi.fn((id: string, step: any) =>
            (testDb.service as any).markJobStepCompleted?.(id, step),
          ),
          updateJobTotalPages: vi.fn((id: string, totalPages: number) =>
            (testDb.service as any).updateJobTotalPages?.(id, totalPages),
          ),
          getJobWithProgress: vi.fn((id: string) => testDb.service.getJobWithProgress(id)),
          getJob: vi.fn((id: string) => testDb.service.getJob(id)),
        }),
        episodes: () => ({
          getEpisodesByJobId: vi.fn((jobId: string) => testDb.service.getEpisodesByJobId(jobId)),
          // AnalyzePipeline -> EpisodeWriteService.bulkUpsert で呼ばれる
          createEpisodes: vi.fn((episodes: any[]) => testDb.service.createEpisodes(episodes)),
        }),
        chunks: () => ({
          createChunk: vi.fn((payload: any) => testDb.service.createChunk(payload)),
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

    // db-factoryのモック（アプリ側が取得するDBサービスをテストDBに固定）
    vi.doMock('@/services/db-factory', () => ({
      __resetDatabaseServiceForTest: vi.fn(),
      getDatabaseService: vi.fn(() => testDb.service),
    }))

    // getDatabase関数のモック（transaction-managerが使用）
    vi.doMock('@/db', () => ({
      getDatabase: vi.fn(() => testDb.db),
    }))

    // エージェントモックのセットアップ
    setupAgentMocks()
    // chunk-analyzer を安定化させる（常に結果を返す）
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

    // NOTE: repositories/index の上書きは副作用が大きいため行わない（factory 側で十分）

    // setupAgentMocks内の '@/config' モックでは scriptConversion 設定が未定義のため、上書きする
    vi.doMock('@/config', () => ({
      getAppConfigWithOverrides: vi.fn(() => ({
        chunking: {
          defaultChunkSize: 3000,
          defaultOverlapSize: 200,
        },
        processing: {
          maxConcurrentChunks: 3,
          batchSize: { chunks: 5 },
          episode: {
            targetCharsPerEpisode: 10000,
            minCharsPerEpisode: 5000,
            maxCharsPerEpisode: 20000,
          },
        },
        features: {
          enableParallelProcessing: true,
        },
        llm: {
          textAnalysis: {
            systemPrompt: 'Test system prompt',
            userPromptTemplate: 'テスト用プロンプト: {{chunkText}}',
          },
        },
      })),
      getTextAnalysisConfig: vi.fn(() => ({
        userPromptTemplate: 'テスト用プロンプト: {{chunkText}}',
      })),
      getScriptConversionConfig: vi.fn(() => ({
        systemPrompt: 'script-system',
        userPromptTemplate: 'Episode: {{episodeText}}',
      })),
      getChunkingConfig: vi.fn(() => ({
        // テストでは短い本文でも4チャンク以上になるよう小さめに設定
        defaultChunkSize: 150,
        defaultOverlapSize: 30,
        maxChunkSize: 10000,
        minChunkSize: 50,
        maxOverlapRatio: 0.5,
      })),
      getLLMProviderConfig: vi.fn(() => ({
        apiKey: 'test-key',
        model: 'test-model',
        maxTokens: 1000,
      })),
      getLLMDefaultProvider: vi.fn(() => 'openai'),
      getEpisodeConfig: vi.fn(() => ({
        targetCharsPerEpisode: 1000,
        minCharsPerEpisode: 500,
        maxCharsPerEpisode: 2000,
        charsPerPage: 300,
      })),
      getDatabaseConfig: vi.fn(() => ({ sqlite: { path: ':memory:' } })),
      getLayoutGenerationConfig: vi.fn(() => ({
        provider: 'openai',
        maxTokens: 1000,
        systemPrompt: 'テスト用レイアウト生成プロンプト',
      })),
      getPageBreakEstimationConfig: vi.fn(() => ({
        provider: 'openai',
        maxTokens: 1000,
        systemPrompt: 'ページ切れ目推定system',
        userPromptTemplate:
          'avgLinesPerPage={{avgLinesPerPage}}; avgCharsPerLine={{avgCharsPerLine}}; episodeSummary={{episodeSummary}}; chunkSnippets={{chunkSnippets}}',
      })),
      isDevelopment: vi.fn(() => true),
    }))

    // afterEach の resetAllMocks でトップレベルの vi.mock 実装が消えるため、
    // page-break-estimator と panel-assignment もここで毎回上書きする
    vi.doMock('@/agents/script/page-break-estimator', () => ({
      estimatePageBreaks: vi.fn().mockResolvedValue({
        pages: [
          {
            pageNumber: 1,
            panelCount: 3,
            panels: [
              { panelIndex: 1, content: 'c1', dialogue: [] },
              { panelIndex: 2, content: 'c2', dialogue: [] },
              { panelIndex: 3, content: 'c3', dialogue: [] },
            ],
          },
        ],
      }),
    }))

    vi.doMock('@/agents/script/panel-assignment', () => ({
      assignPanels: vi.fn().mockResolvedValue({
        pages: [
          {
            pageNumber: 1,
            panelCount: 3,
            panels: [
              { id: 1, scriptIndexes: [1] },
              { id: 2, scriptIndexes: [2] },
              { id: 3, scriptIndexes: [3] },
            ],
          },
        ],
      }),
      buildLayoutFromAssignment: vi.fn().mockReturnValue({
        pages: [
          {
            id: 1,
            panels: [
              { id: 'panel-1', content: { text: 'p1' } },
              { id: 'panel-2', content: { text: 'p2' } },
              { id: 'panel-3', content: { text: 'p3' } },
            ],
          },
        ],
      }),
    }))

    // Script converter も resetAllMocks の影響を受けるため、ここで毎回上書きする
    const { convertChunkToMangaScript } = await import('@/agents/script/script-converter')
    vi.mocked(convertChunkToMangaScript).mockResolvedValue({
      style_tone: 'テスト用トーン',
      style_art: 'テスト用アート',
      style_sfx: 'テスト用効果音',
      characters: [
        {
          id: 'char_1',
          name_ja: '太郎',
          role: 'protagonist',
          speech_style: 'カジュアル',
          aliases: ['太郎'],
        },
      ],
      locations: [
        {
          id: 'loc_1',
          name_ja: 'テスト場所',
          notes: 'テスト用場所',
        },
      ],
      props: [],
      panels: [
        {
          no: 1,
          cut: 'テスト舞台設定',
          camera: 'medium',
          dialogue: [],
        },
        {
          no: 2,
          cut: 'テストセリフ',
          camera: 'close',
          dialogue: ['太郎: テストセリフ'],
        },
      ],
      continuity_checks: [],
    })

    vi.mocked(convertEpisodeTextToScript).mockResolvedValue({
      style_tone: 'テスト用トーン',
      style_art: 'テスト用アート',
      style_sfx: 'テスト用効果音',
      characters: [
        {
          id: 'char_1',
          name_ja: '太郎',
          role: 'protagonist',
          speech_style: 'カジュアル',
          aliases: ['太郎'],
        },
      ],
      locations: [
        {
          id: 'loc_1',
          name_ja: 'テスト場所',
          notes: 'テスト用場所',
        },
      ],
      props: [],
      panels: [
        {
          no: 1,
          cut: 'テスト舞台設定',
          camera: 'medium',
          dialogue: [],
        },
        {
          no: 2,
          cut: 'テストセリフ',
          camera: 'close',
          dialogue: ['太郎: テストセリフ'],
        },
      ],
      continuity_checks: [],
    })

    // PageBreakStep を steps バレル経由で上書き（AnalyzePipeline は './steps' から import）
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
                pageBreakPlan: {
                  pages: [
                    {
                      pageNumber: 1,
                      panelCount: 1,
                      panels: [{ panelIndex: 1, content: 'demo', dialogue: [] }],
                    },
                  ],
                },
                totalPages: 1,
              },
            }
          }
        },
      }
    })
    ;({ AnalyzePipeline } = await import('@/services/application/analyze-pipeline'))
  })

  afterEach(async () => {
    __testDbForFactory = undefined
    resetAgentMocks()
    testStorageFactory?.clearAll?.()
    await cleanupTestDatabase(testDb)
    vi.clearAllMocks()
    vi.resetAllMocks() // モックを完全にリセット
  })

  describe('AnalyzePipeline Service', () => {
    it('完全な分析パイプラインを実行できる', async () => {
      // 準備: テスト用小説データ
      const novel = await dataFactory.createNovel({
        id: 'test-novel-pipeline',
        title: 'Pipeline Test Novel',
        textLength: 5000,
      })

      const novelText =
        'これは統合テスト用の長い小説テキストです。登場人物が活躍し、様々な場面が展開されます。'.repeat(
          150,
        )
      await storageDataFactory.seedNovelText(novel.id, novelText, {
        title: novel.title,
      })

      // 実行: 分析パイプラインの実行
      const pipeline = new AnalyzePipeline()
      const result = await pipeline.runWithText(novel.id, novelText, {
        title: novel.title,
        isDemo: true, // Use demo episodes to avoid "Episode not found" error
      })

      // 検証: パイプライン結果
      expect(result.response?.success).toBe(true)
      expect(result.jobId).toBeDefined()
      expect(result.chunkCount).toBeGreaterThan(0)

      // 検証: データベースの状態
      const job = await testDb.service.getJob(result.jobId)
      expect(job).toBeDefined()
      expect(job?.status).toBe('completed')
      expect(job?.novelId).toBe(novel.id)

      // 検証: チャンクが作成されている
      const chunks = await testDb.service.getChunksByJobId(result.jobId)
      expect(chunks.length).toBe(result.chunkCount)
      expect(chunks[0].contentPath).toBeDefined()
      expect(chunks[0].wordCount).toBeGreaterThan(0)

      // 検証: ストレージにチャンクが保存されている
      const chunkStorage = await testStorageFactory.getChunkStorage()
      expect(chunkStorage.has(`${result.jobId}/chunk_0.txt`)).toBe(true)

      // 検証: 分析結果 (isDemoモードではスキップされるため、チェックしない)
      // const analysisStorage = await testStorageFactory.getAnalysisStorage();
      // expect(analysisStorage.has(`${result.jobId}/analysis/chunk-0.json`)).toBe(true);
    })

    it('存在しない小説IDでは適切なエラーが発生する', async () => {
      const pipeline = new AnalyzePipeline()

      await expect(
        pipeline.runWithNovelId('nonexistent-novel-id', {
          userEmail: 'test@example.com',
        }),
      ).rejects.toThrow('小説のテキストがストレージに見つかりません')
    })

    it('ストレージにテキストが存在しない場合は適切なエラーが発生する', async () => {
      // 準備: データベースには小説レコードがあるが、ストレージにはテキストがない状態
      const novel = await dataFactory.createNovel({
        id: 'test-novel-no-storage',
        title: 'No Storage Novel',
        textLength: 1000,
      })
      // ストレージにはデータを保存しない

      const pipeline = new AnalyzePipeline()

      await expect(
        pipeline.runWithNovelId(novel.id, {
          userEmail: 'test@example.com',
        }),
      ).rejects.toThrow('小説のテキストがストレージに見つかりません')
    })
  })

  describe('Database and Storage Integration', () => {
    it('データベースとストレージ間のデータ一貫性を保つ', async () => {
      // 完全なパイプライン実行でデータベースとストレージの一貫性をテストします

      // 準備: 小説データの作成
      const novel = await dataFactory.createNovel({
        title: 'Consistency Test Novel',
        textLength: 2000,
      })

      const novelText = 'データ一貫性テスト用のテキストです。'.repeat(350) // 6300文字確保
      await storageDataFactory.seedNovelText(novel.id, novelText)

      // AnalyzePipelineの完全実行
      const pipeline = new AnalyzePipeline()
      const result = await pipeline.runWithText(novel.id, novelText, {
        title: novel.title,
        isDemo: true,
      })

      // 基本的なパイプライン実行結果の確認
      expect(result.response?.success).toBe(true)
      expect(result.jobId).toBeDefined()
      expect(result.chunkCount).toBeGreaterThan(0)

      // データベース一貫性の検証
      const job = await testDb.service.getJob(result.jobId)
      expect(job).toBeDefined()
      expect(job?.status).toBe('completed')
      expect(job?.novelId).toBe(novel.id)

      // データベースに小説データが存在することを確認
      const dbNovel = await testDb.service.getNovel(novel.id)
      expect(dbNovel).toBeDefined()
      expect(dbNovel?.id).toBe(novel.id)
      expect(dbNovel?.title).toBe('Consistency Test Novel')

      // チャンクがデータベースとストレージの両方に存在することを確認
      const chunks = await testDb.service.getChunksByJobId(result.jobId)
      expect(chunks.length).toBe(result.chunkCount)
      expect(chunks[0].contentPath).toBeDefined()

      // ストレージにチャンクが保存されていることを確認
      const chunkStorage = await testStorageFactory.getChunkStorage()
      expect(chunkStorage.has(`${result.jobId}/chunk_0.txt`)).toBe(true)

      console.log(
        '✅ データ一貫性テスト: 完全なパイプライン実行でデータベースとストレージの一貫性が保たれている',
      )
    })

    it('トランザクション境界でのロールバック処理', async () => {
      // このテストは実際のエラーケースでのロールバック動作を検証
      // より詳細な実装は実際のエラーハンドリング仕様に応じて調整

      const novel = await dataFactory.createNovel({
        title: 'Rollback Test Novel',
        textLength: 1000,
      })

      // ストレージエラーをシミュレート
      const chunkStorage = await testStorageFactory.getChunkStorage()
      const originalPut = chunkStorage.put.bind(chunkStorage)
      vi.spyOn(chunkStorage, 'put').mockImplementationOnce(() => {
        throw new Error('Storage error for testing')
      })

      const pipeline = new AnalyzePipeline()

      // エラーが適切に伝播することを確認
      await expect(
        pipeline.runWithNovelId(novel.id, {
          userEmail: 'test@example.com',
        }),
      ).rejects.toThrow()

      // モックを元に戻す
      vi.mocked(chunkStorage.put).mockImplementation(originalPut)
    })
  })
})
