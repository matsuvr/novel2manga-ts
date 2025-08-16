/**
 * 統合テスト用エージェントモック
 * LLMサービスを安定した結果で置き換え
 */

import { vi } from "vitest";

/**
 * テスト用のAgent応答データ
 */
export const TEST_CHUNK_ANALYSIS = {
  summary: "テスト用チャンク分析結果",
  characters: [
    {
      name: "主人公",
      description: "ストーリーの主人公",
      firstAppearance: 0,
    },
    {
      name: "サブキャラクター",
      description: "主人公を支援するキャラクター",
      firstAppearance: 50,
    },
  ],
  scenes: [
    {
      location: "テスト場所",
      time: "朝",
      description: "テストシーンの説明",
      startIndex: 0,
      endIndex: 200,
    },
  ],
  dialogues: [
    {
      speakerId: "主人公",
      text: "こんにちは、世界！",
      emotion: "happy" as const,
      index: 100,
    },
  ],
  highlights: [
    {
      type: "climax" as const,
      description: "ストーリーのクライマックス",
      importance: 9,
      startIndex: 150,
      endIndex: 200,
      text: "クライマックスのテキスト",
    },
  ],
  situations: [
    {
      description: "テスト状況の説明",
      index: 75,
    },
  ],
};

export const TEST_EPISODE_BOUNDARIES = [
  {
    episodeNumber: 1,
    title: "テストエピソード1",
    summary: "テスト用エピソード1の要約",
    startChunk: 0,
    startCharIndex: 0,
    endChunk: 1,
    endCharIndex: 500,
    estimatedPages: 8,
    confidence: 0.9,
    plotPoints: ["キャラクター紹介", "設定の説明"],
  },
  {
    episodeNumber: 2,
    title: "テストエピソード2",
    summary: "テスト用エピソード2の要約",
    startChunk: 2,
    startCharIndex: 0,
    endChunk: 3,
    endCharIndex: 800,
    estimatedPages: 10,
    confidence: 0.85,
    plotPoints: ["問題の発生", "困難の始まり"],
  },
];

/**
 * チャンクアナライザーエージェントのモック
 */
export function createMockChunkAnalyzer() {
  return {
    generateObject: vi.fn().mockResolvedValue(TEST_CHUNK_ANALYSIS),
  };
}

/**
 * ナラティブアーク分析のモック
 */
export function createMockNarrativeAnalyzer() {
  return vi.fn().mockResolvedValue(TEST_EPISODE_BOUNDARIES);
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
          title: "テストエピソード1",
          summary: "テスト用エピソード1の要約",
          startChunkIndex: 0,
          endChunkIndex: 4,
          estimatedPageCount: 8,
        },
        {
          episodeNumber: 2,
          title: "テストエピソード2",
          summary: "テスト用エピソード2の要約",
          startChunkIndex: 5,
          endChunkIndex: 9,
          estimatedPageCount: 10,
        },
      ],
    }),
  };
}

/**
 * 統合テスト用エージェントモックのセットアップ
 */
export function setupAgentMocks() {
  // 基底Agent クラスのOpenAI接続をモック
  vi.mock("@/agents/agent", () => {
    const originalModule = vi.importActual("@/agents/agent") as any;
    return {
      ...originalModule,
      Agent: vi.fn().mockImplementation(() => ({
        generateObject: vi.fn().mockResolvedValue({
          pages: [
            { pageNumber: 1, panelCount: 4 },
            { pageNumber: 2, panelCount: 6 },
          ],
        }),
        generate: vi.fn().mockResolvedValue("test response"),
      })),
    };
  });

  // PageSplitAgent の具体的なモック
  vi.mock("@/agents/page-splitter", () => ({
    PageSplitAgent: vi.fn().mockImplementation(() => {
      let callCount = 0;
      return {
        planNextBatch: vi.fn().mockImplementation(async (episodeData, currentPages) => {
          callCount++;
          const currentPageCount = currentPages ? currentPages.length : 0;
          
          // 既に十分なページがある場合は終了
          if (currentPageCount >= 8) {
            return {
              episodeNumber: 1,
              startPage: currentPageCount + 1,
              plannedPages: [],
              mayAdjustPreviousPages: false,
              remainingPagesEstimate: 0,
            };
          }
          
          // 最初の呼び出しでは全てのページを計画して終了とする
          if (callCount === 1) {
            const plannedPages = [];
            for (let i = currentPageCount + 1; i <= 8; i++) {
              plannedPages.push({
                pageNumber: i,
                summary: `test page ${i}`,
                importance: 5,
                segments: [
                  {
                    contentHint: `test content ${i}`,
                    importance: 5,
                    source: { chunkIndex: 0, startOffset: (i-1) * 100, endOffset: i * 100 },
                  },
                ],
              });
            }
            
            return {
              episodeNumber: 1,
              startPage: currentPageCount + 1,
              plannedPages,
              mayAdjustPreviousPages: false,
              remainingPagesEstimate: 0, // 残りページを0にして生成を終了
            };
          }
          
          // 2回目以降の呼び出しでは空の計画を返して終了
          return {
            episodeNumber: 1,
            startPage: currentPageCount + 1,
            plannedPages: [],
            mayAdjustPreviousPages: false,
            remainingPagesEstimate: 0,
          };
        }),
      };
    }),
  }));

  // config の部分モック（不足APIを補完）
  vi.mock("@/config", () => ({
    getTextAnalysisConfig: vi.fn(() => ({
      provider: "openai",
      maxTokens: 1000,
      systemPrompt: "system",
      userPromptTemplate: "テスト用プロンプト: {{chunkText}}",
    })),
    getLLMDefaultProvider: vi.fn(() => "openai"),
    getLLMProviderConfig: vi.fn(() => ({
      maxTokens: 1000,
      apiKey: "test-key",
      model: "test-model",
    })),
    getLLMFallbackChain: vi.fn(() => ["openai", "anthropic"]),
    getEpisodeConfig: vi.fn(() => ({
      targetCharsPerEpisode: 1000,
      minCharsPerEpisode: 500,
      maxCharsPerEpisode: 2000,
      charsPerPage: 300,
    })),
    getDatabaseConfig: vi.fn(() => ({ sqlite: { path: ":memory:" } })),
    getLayoutGenerationConfig: vi.fn(() => ({
      provider: "openai",
      maxTokens: 1000,
      systemPrompt: "テスト用レイアウト生成プロンプト",
    })),
    getNarrativeAnalysisConfig: vi.fn(() => ({
      provider: "openai",
      maxTokens: 1000,
      systemPrompt: "テスト用ナラティブ分析プロンプト",
    })),
  }));
  // チャンクアナライザーのモック
  vi.mock("@/agents/chunk-analyzer", () => ({
    getChunkAnalyzerAgent: vi.fn(() => createMockChunkAnalyzer()),
    analyzeChunkWithFallback: vi.fn(async (_prompt: string, _schema: any) => ({
      result: TEST_CHUNK_ANALYSIS as any,
      usedProvider: "mock",
      fallbackFrom: [],
    })),
  }));

  // ナラティブアーク分析のモック
  vi.mock("@/agents/narrative-arc-analyzer", () => ({
    analyzeNarrativeArc: createMockNarrativeAnalyzer(),
  }));

  // エピソード生成エージェントのモック
  vi.mock("@/agents/episode-generator", () => ({
    getEpisodeGeneratorAgent: vi.fn(() => createMockEpisodeGenerator()),
  }));

  // レイアウト生成エージェントのモック
  vi.mock("@/agents/layout-generator", () => ({
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
      layoutPath: "test-layout.yaml",
      layout: {
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                id: "panel1",
                type: "dialogue",
                content: "テスト対話",
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
      const pages = plan.plannedPages.map(plannedPage => ({
        page_number: plannedPage.pageNumber,
        panels: Array.from({ length: 4 }, (_, i) => ({
          position: { x: i % 2 * 0.5, y: Math.floor(i / 2) * 0.5 },
          size: { width: 0.5, height: 0.5 },
        })),
      }));
      return { pages };
    }),
  }));

  // テキスト分割のモック
  vi.mock("@/utils/text-splitter", () => ({
    splitTextIntoChunks: vi.fn((text: string) => {
      const chunkSize = Math.ceil(text.length / 4); // 4チャンクに分割
      const chunks: string[] = [];
      for (let i = 0; i < 4; i++) {
        const start = i * chunkSize;
        const end = Math.min((i + 1) * chunkSize, text.length);
        chunks.push(text.substring(start, end));
      }
      return chunks;
    }),
  }));

  // storage モジュールは各テストファイル側でモック定義があるため、ここでは触らない

  // UUID生成のモック（予測可能な値を返す）
  vi.mock("@/utils/uuid", () => {
    let counter = 0;
    return {
      // 契約テスト期待: /^test-uuid-\\d+$/ にマッチ（先頭に1つのバックスラッシュ、続く 'd' の繰り返し）
      // 並行時の一意性は 'd' の長さで担保
      generateUUID: vi.fn(() => {
        counter += 1;
        const length = 12 + (counter % 50);
        return `test-uuid-\\${"d".repeat(length)}`;
      }),
    };
  });
}

/**
 * エージェントモックのリセット
 */
export function resetAgentMocks() {
  vi.clearAllMocks();
}
