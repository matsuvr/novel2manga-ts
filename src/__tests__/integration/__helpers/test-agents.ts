/**
 * 統合テスト用エージェントモック
 * LLMサービスを安定した結果で置き換え
 */

import { vi } from 'vitest'

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

export const TEST_NARRATIVE_ARC = [
  {
    arcType: 'setup' as const,
    startChunkIndex: 0,
    endChunkIndex: 2,
    description: 'ストーリーのセットアップ部分',
    keyEvents: ['キャラクター紹介', '設定の説明'],
  },
  {
    arcType: 'confrontation' as const,
    startChunkIndex: 3,
    endChunkIndex: 7,
    description: 'コンフリクト発生',
    keyEvents: ['問題の発生', '困難の始まり'],
  },
  {
    arcType: 'resolution' as const,
    startChunkIndex: 8,
    endChunkIndex: 9,
    description: '解決パート',
    keyEvents: ['問題解決', '結末'],
  },
]

/**
 * チャンクアナライザーエージェントのモック
 */
export function createMockChunkAnalyzer() {
  return {
    generateObject: vi.fn().mockResolvedValue(TEST_CHUNK_ANALYSIS),
  }
}

/**
 * ナラティブアーク分析のモック
 */
export function createMockNarrativeAnalyzer() {
  return vi.fn().mockResolvedValue(TEST_NARRATIVE_ARC)
}

/**
 * エピソード生成エージェントのモック
 */
export function createMockEpisodeGenerator() {
  return {
    generateObject: vi.fn().mockResolvedValue({
      episodes: [
        {
          episodeNumber: 1,
          title: 'テストエピソード1',
          summary: 'テスト用エピソード1の要約',
          startChunkIndex: 0,
          endChunkIndex: 4,
          estimatedPageCount: 8,
        },
        {
          episodeNumber: 2,
          title: 'テストエピソード2',
          summary: 'テスト用エピソード2の要約',
          startChunkIndex: 5,
          endChunkIndex: 9,
          estimatedPageCount: 10,
        },
      ],
    }),
  }
}

/**
 * 統合テスト用エージェントモックのセットアップ
 */
export function setupAgentMocks() {
  // チャンクアナライザーのモック
  vi.mock('@/agents/chunk-analyzer', () => ({
    getChunkAnalyzerAgent: vi.fn(() => createMockChunkAnalyzer()),
  }))

  // ナラティブアーク分析のモック
  vi.mock('@/agents/narrative-arc-analyzer', () => ({
    analyzeNarrativeArc: createMockNarrativeAnalyzer(),
  }))

  // エピソード生成エージェントのモック
  vi.mock('@/agents/episode-generator', () => ({
    getEpisodeGeneratorAgent: vi.fn(() => createMockEpisodeGenerator()),
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
  }))

  // UUID生成のモック（予測可能な値を返す）
  vi.mock('@/utils/uuid', () => ({
    generateUUID: vi.fn(() => `test-uuid-${Date.now()}`),
  }))
}

/**
 * エージェントモックのリセット
 */
export function resetAgentMocks() {
  vi.clearAllMocks()
}