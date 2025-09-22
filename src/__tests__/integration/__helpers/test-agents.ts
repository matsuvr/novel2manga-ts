/**
 * 統合テスト用エージェントモック
 * 新しいLLMエージェントアーキテクチャに対応
 */

import { vi } from 'vitest'
import { AgentCore } from '@/agents/core'
import { FakeLlmClient } from '@/agents/llm/fake'
import { ReActPolicy } from '@/agents/policies/react'
import { SingleTurnPolicy } from '@/agents/policies/singleTurn'
import { SimpleToolRegistry } from '@/agents/tools'

/**
 * テスト用のAgent応答データ
 */
export const TEST_CHUNK_ANALYSIS = {
  summary: 'テスト用チャンク分析結果',
  characters: [
    {
      name: '主人公',
      description: 'ストーリーの主人公',
      firstAppearance: 0,
    },
    {
      name: 'サブキャラクター',
      description: '主人公を支援するキャラクター',
      firstAppearance: 50,
    },
  ],
  scenes: [
    {
      location: 'テスト場所',
      time: '朝',
      description: 'テストシーンの説明',
      startIndex: 0,
      endIndex: 200,
    },
  ],
  dialogues: [
    {
      speakerId: '主人公',
      text: 'こんにちは、世界！',
      emotion: 'happy' as const,
      index: 100,
    },
  ],
  highlights: [
    {
      type: 'climax' as const,
      description: 'ストーリーのクライマックス',
      importance: 9,
      startIndex: 150,
      endIndex: 200,
      text: 'クライマックスのテキスト',
    },
  ],
  situations: [
    {
      description: 'テスト状況の説明',
      index: 75,
    },
  ],
}

export const TEST_EPISODE_BOUNDARIES = [
  {
    episodeNumber: 1,
    title: 'テストエピソード1',
    summary: 'テスト用エピソード1の要約',
    startChunk: 0,
    startCharIndex: 0,
    endChunk: 1,
    endCharIndex: 500,
    confidence: 0.9,
    plotPoints: ['キャラクター紹介', '設定の説明'],
  },
  {
    episodeNumber: 2,
    title: 'テストエピソード2',
    summary: 'テスト用エピソード2の要約',
    startChunk: 2,
    startCharIndex: 0,
    endChunk: 3,
    endCharIndex: 800,
    confidence: 0.85,
    plotPoints: ['問題の発生', '困難の始まり'],
  },
]

export const TEST_EPISODE_CONFIG = {
  targetCharsPerEpisode: 1000,
  minCharsPerEpisode: 500,
  maxCharsPerEpisode: 2000,
  smallPanelThreshold: 20,
  minPanelsPerEpisode: 1,
  maxPanelsPerEpisode: 1000,
  charsPerPage: 300,
}

/**
 * チャンク分析用のFakeLlmClientを作成
 */
export function createMockChunkAnalyzer(): AgentCore {
  const fakeClient = new FakeLlmClient({
    responses: [
      { content: JSON.stringify(TEST_CHUNK_ANALYSIS), role: 'assistant' },
    ],
  })
  return new AgentCore({ client: fakeClient, policy: new SingleTurnPolicy(fakeClient) })
}

/**
 * ナラティブアーク分析用のFakeLlmClientを作成
 */
export function createMockNarrativeAnalyzer(): AgentCore {
  const fakeClient = new FakeLlmClient({
    responses: [
      { content: JSON.stringify(TEST_EPISODE_BOUNDARIES), role: 'assistant' },
    ],
  })
  return new AgentCore({ client: fakeClient, policy: new SingleTurnPolicy(fakeClient) })
}

/**
 * エピソード生成用のFakeLlmClientを作成
 */
export function createMockEpisodeGenerator(): AgentCore {
  const fakeClient = new FakeLlmClient({
    responses: [
      {
        content: JSON.stringify({
          episodes: [
            { episodeNumber: 1, title: 'テストエピソード1', summary: 'テスト用エピソード1の要約', startChunkIndex: 0, endChunkIndex: 4, estimatedPageCount: 8 },
            { episodeNumber: 2, title: 'テストエピソード2', summary: 'テスト用エピソード2の要約', startChunkIndex: 5, endChunkIndex: 9, estimatedPageCount: 10 },
          ],
        }),
        role: 'assistant',
      },
    ],
  })
  return new AgentCore({ client: fakeClient, policy: new SingleTurnPolicy(fakeClient) })
}

/**
 * レイアウト生成用のFakeLlmClientを作成
 */
export function createMockLayoutGenerator(): AgentCore {
  const fakeClient = new FakeLlmClient({
    responses: [
      {
        content: JSON.stringify({
          pages: [
            { pageNumber: 1, panelCount: 4, panels: [
              { panelIndex: 1, content: 'テスト内容1', dialogue: [{ speaker: 'キャラクター1', text: 'こんにちは' }] },
              { panelIndex: 2, content: 'テスト内容2', dialogue: [{ speaker: 'キャラクター2', text: 'こんにちは' }] },
              { panelIndex: 3, content: 'テスト内容3', dialogue: [] },
              { panelIndex: 4, content: 'テスト内容4', dialogue: [{ speaker: 'ナレーション', text: '場面が変わる' }] },
            ] },
            { pageNumber: 2, panelCount: 6, panels: [
              { panelIndex: 1, content: 'テスト内容5', dialogue: [] },
              { panelIndex: 2, content: 'テスト内容6', dialogue: [{ speaker: 'キャラクター1', text: 'さようなら' }] },
              { panelIndex: 3, content: 'テスト内容7', dialogue: [] },
              { panelIndex: 4, content: 'テスト内容8', dialogue: [] },
              { panelIndex: 5, content: 'テスト内容9', dialogue: [{ speaker: 'キャラクター2', text: 'また明日' }] },
              { panelIndex: 6, content: 'テスト内容10', dialogue: [] },
            ] },
          ],
        }),
        role: 'assistant',
      },
    ],
  })
  return new AgentCore({ client: fakeClient, policy: new SingleTurnPolicy(fakeClient) })
}

/**
 * 統合テスト用エージェントモックのセットアップ
 */
export function setupAgentMocks() {
  // 新しいLLMエージェントアーキテクチャのモック
  vi.mock('@/llm', () => ({
    createLlmClient: vi.fn(() => new FakeLlmClient()),
    createLlmClientFromConfig: vi.fn(() => new FakeLlmClient()),
    createLlmClientWithFallback: vi.fn(() => new FakeLlmClient()),
    getDefaultProvider: vi.fn(() => 'fake'),
  }))

  // 新しいエージェントコアのモック
  vi.mock('@/agents/core', () => ({
    AgentCore: vi.fn().mockImplementation(() => ({
      run: vi.fn().mockResolvedValue({
        messages: [
          { role: 'user', content: 'test input' },
          { role: 'assistant', content: JSON.stringify(TEST_CHUNK_ANALYSIS) },
        ],
        metadata: { provider: 'fake' },
      }),
      setPolicy: vi.fn(),
      registerTool: vi.fn(),
      getTool: vi.fn(),
    })),
    AgentCoreFactory: {},
  }))

  // 後方互換性のためのCompatAgentモック
  vi.mock('@/agents/compat', () => ({
    CompatAgent: vi.fn().mockImplementation(() => ({
      generateObject: vi.fn().mockResolvedValue(TEST_CHUNK_ANALYSIS),
      generate: vi.fn().mockResolvedValue('test response'),
    })),
    CompatAgentFactory: {
      create: vi.fn(() => ({
        generateObject: vi.fn().mockResolvedValue(TEST_CHUNK_ANALYSIS),
        generate: vi.fn().mockResolvedValue('test response'),
      })),
    },
  }))

  // 古いエージェントクラスのモック（後方互換性のため）
  vi.mock('@/agents/agent', () => {
    const originalModule = vi.importActual('@/agents/agent') as any
    return {
      ...originalModule,
      Agent: vi.fn().mockImplementation(() => ({
        generateObject: vi.fn().mockResolvedValue({
          pages: [
            {
              pageNumber: 1,
              panelCount: 4,
              panels: [
                { panelIndex: 1, content: 'テスト内容1', dialogue: [] },
                { panelIndex: 2, content: 'テスト内容2', dialogue: [] },
                { panelIndex: 3, content: 'テスト内容3', dialogue: [] },
                { panelIndex: 4, content: 'テスト内容4', dialogue: [] },
              ],
            },
            {
              pageNumber: 2,
              panelCount: 6,
              panels: [
                { panelIndex: 1, content: 'テスト内容5', dialogue: [] },
                { panelIndex: 2, content: 'テスト内容6', dialogue: [] },
                { panelIndex: 3, content: 'テスト内容7', dialogue: [] },
                { panelIndex: 4, content: 'テスト内容8', dialogue: [] },
                { panelIndex: 5, content: 'テスト内容9', dialogue: [] },
                { panelIndex: 6, content: 'テスト内容10', dialogue: [] },
              ],
            },
          ],
        }),
        generate: vi.fn().mockResolvedValue('test response'),
      })),
    }
  })

  // PageSplitAgent の具体的なモック
  vi.mock('@/agents/page-splitter', () => ({
    PageSplitAgent: vi.fn().mockImplementation(() => {
      let callCount = 0
      return {
        planNextBatch: vi.fn().mockImplementation(async (episodeData, currentPages) => {
          callCount++
          const currentPageCount = currentPages ? currentPages.length : 0

          // 既に十分なページがある場合は終了
          if (currentPageCount >= 8) {
            return {
              episodeNumber: 1,
              startPage: currentPageCount + 1,
              plannedPages: [],
              mayAdjustPreviousPages: false,
              remainingPagesEstimate: 0,
            }
          }

          // 最初の呼び出しでは全てのページを計画して終了とする
          if (callCount === 1) {
            const plannedPages = []
            for (let i = currentPageCount + 1; i <= 8; i++) {
              plannedPages.push({
                pageNumber: i,
                summary: `test page ${i}`,
                importance: 5,
                segments: [
                  {
                    contentHint: `test content ${i}`,
                    importance: 5,
                    source: {
                      chunkIndex: 0,
                      startOffset: (i - 1) * 100,
                      endOffset: i * 100,
                    },
                  },
                ],
              })
            }

            return {
              episodeNumber: 1,
              startPage: currentPageCount + 1,
              plannedPages,
              mayAdjustPreviousPages: false,
              remainingPagesEstimate: 0, // 残りページを0にして生成を終了
            }
          }

          // 2回目以降の呼び出しでは空の計画を返して終了
          return {
            episodeNumber: 1,
            startPage: currentPageCount + 1,
            plannedPages: [],
            mayAdjustPreviousPages: false,
            remainingPagesEstimate: 0,
          }
        }),
      }
    }),
  }))

  // config の部分モック（legacy analysis 廃止に伴い簡素化）
  vi.mock('@/config', () => ({
    getChunkingConfig: vi.fn(() => ({
      defaultChunkSize: 150,
      defaultOverlapSize: 30,
      maxChunkSize: 10000,
      minChunkSize: 50,
      maxOverlapRatio: 0.5,
    })),
    getLLMDefaultProvider: vi.fn(() => 'fake'),
    getLLMProviderConfig: vi.fn(() => ({
      maxTokens: 1000,
      apiKey: 'fake-key',
      model: 'fake-model',
    })),
    getLLMFallbackChain: vi.fn(() => ['fake']),
    getEpisodeConfig: vi.fn(() => TEST_EPISODE_CONFIG),
    getDatabaseConfig: vi.fn(() => ({ sqlite: { path: ':memory:' } })),
    getLayoutGenerationConfig: vi.fn(() => ({
      provider: 'fake',
      maxTokens: 1000,
      systemPrompt: 'テスト用レイアウト生成プロンプト',
    })),
  }))

  // チャンクアナライザーのモック
  vi.mock('@/agents/chunk-analyzer', () => ({
    getChunkAnalyzerAgent: vi.fn(() => createMockChunkAnalyzer()),
    analyzeChunkWithFallback: vi.fn(async (_prompt: string, _schema: any) => ({
      result: TEST_CHUNK_ANALYSIS as any,
      usedProvider: 'fake',
      fallbackFrom: [],
    })),
  }))

  // エピソード生成エージェントのモック（ファイルが存在しないため削除）
  // vi.mock("@/agents/episode-generator", () => ({
  //   getEpisodeGeneratorAgent: vi.fn(() => createMockEpisodeGenerator()),
  // }));

  // レイアウト生成エージェントのモック
  vi.mock('@/agents/layout-generator', () => ({
    LayoutGeneratorAgent: vi.fn().mockImplementation(() => ({
      generateObject: vi.fn().mockResolvedValue({
        pages: [
          { pageNumber: 1, panelCount: 4 },
          { pageNumber: 2, panelCount: 6 },
        ],
      }),
    })),
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
    generateMangaLayoutForPlan: vi.fn().mockImplementation(async (episodeData, plan) => {
      // planに含まれるページに基づいて動的にレイアウトを生成
      // 型安全化: PlannedPage 型を利用
      const pages = plan.plannedPages.map((plannedPage: import('@/types/page-splitting').PlannedPage) => ({
        page_number: plannedPage.pageNumber,
        panels: Array.from({ length: 4 }, (_, i) => ({
          position: { x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5 },
          size: { width: 0.5, height: 0.5 },
        })),
      }))
      return { pages }
    }),
  }))

  // テキスト分割のモック
  vi.mock('@/utils/text-splitter', () => ({
    splitTextIntoChunks: vi.fn((text: string) => {
      const chunkSize = Math.ceil(text.length / 4) // 4チャンクに分割
      const chunks: string[] = []
      for (let i = 0; i < 4; i++) {
        const start = i * chunkSize
        const end = Math.min((i + 1) * chunkSize, text.length)
        chunks.push(text.substring(start, end))
      }
      return chunks
    }),
    splitTextIntoSlidingChunks: vi.fn(
      (
        text: string,
        chunkSize: number,
        overlap: number,
        _bounds?: { minChunkSize?: number; maxChunkSize?: number; maxOverlapRatio?: number },
      ) => {
        const len = text.length
        if (len === 0) return []
        const size = Math.max(1, Math.floor(chunkSize))
        const ov = Math.max(0, Math.min(Math.floor(overlap), size - 1))
        const stride = Math.max(1, size - ov)
        const chunks: string[] = []
        for (let start = 0; start < len; start += stride) {
          const end = Math.min(len, start + size)
          chunks.push(text.slice(start, end))
        }
        return chunks
      },
    ),
  }))

  // storage モジュールは各テストファイル側でモック定義があるため、ここでは触らない

  // UUID生成のモック（予測可能な値を返す）
  vi.mock('@/utils/uuid', () => {
    let counter = 0
    return {
      // 契約テスト期待: valid storage key format (no backslashes)
      // 並行時の一意性は counter で担保
      generateUUID: vi.fn(() => {
        counter += 1
        return `test-uuid-${counter.toString().padStart(13, 'd')}`
      }),
    }
  })
}

/**
 * エージェントモックのリセット
 */
export function resetAgentMocks() {
  vi.clearAllMocks()
}
