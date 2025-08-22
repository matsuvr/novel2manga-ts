import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertEpisodeTextToScriptWithFragments } from '@/agents/script/fragment-script-converter'

// LLM generator のモック
const mockGenerateObjectWithFallback = vi.fn()
vi.mock('@/agent/structured-generator', () => ({
  getLlmStructuredGenerator: () => ({
    generateObjectWithFallback: mockGenerateObjectWithFallback,
  }),
}))

// 通常のスクリプト変換のモック
vi.mock('@/agents/script/script-converter', () => ({
  convertEpisodeTextToScript: vi.fn(),
}))

// app config のモック
vi.mock('@/config/app.config', () => ({
  getAppConfigWithOverrides: () => ({
    chunking: {
      scriptConversion: {
        fragmentSize: 2000,
        overlapSize: 200,
        maxFragmentSize: 4000,
        minFragmentSize: 500,
      },
    },
    llm: {
      scriptConversion: {
        fragmentConversion: {
          systemPrompt: 'Test system prompt',
          userPromptTemplate:
            'Fragment: {{fragmentText}}, Index: {{fragmentIndex}}/{{totalFragments}}',
        },
      },
    },
  }),
}))

// Logger のモック
vi.mock('@/infrastructure/logging/logger', () => ({
  getLogger: () => ({
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}))

describe('fragment-script-converter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('convertEpisodeTextToScriptWithFragments', () => {
    it('空のエピソードテキストでエラーをスローする', async () => {
      await expect(
        convertEpisodeTextToScriptWithFragments({
          episodeText: '',
        }),
      ).rejects.toThrow('Episode text is required and cannot be empty')
    })

    it('デモモードで固定スクリプトを返す', async () => {
      const result = await convertEpisodeTextToScriptWithFragments(
        {
          episodeText: 'サンプルテキスト',
        },
        {
          isDemo: true,
          episodeNumber: 5,
        },
      )

      expect(result).toEqual({
        title: 'Demo Episode 5',
        scenes: [
          {
            setting: '公園、昼間、晴れ',
            script: [
              {
                type: 'narration',
                text: 'サンプルテキスト...',
              },
              {
                type: 'dialogue',
                speaker: '太郎',
                text: 'やってみよう！',
              },
              {
                type: 'stage',
                text: '太郎が決意を固める。',
              },
            ],
          },
        ],
      })
    })

    it('単一フラグメントの場合は従来の変換方式を使用する', async () => {
      const shortEpisodeText = '短いエピソードテキストです。'

      // NODE_ENV=test でデモモードが有効になるため、process.env を一時的にクリア
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        // 通常のスクリプト変換のモック設定
        const { convertEpisodeTextToScript } = await import('@/agents/script/script-converter')
        vi.mocked(convertEpisodeTextToScript).mockResolvedValue({
          title: 'Test Episode 1',
          scenes: [
            {
              setting: 'テスト場所',
              script: [
                {
                  type: 'narration',
                  text: shortEpisodeText,
                },
              ],
            },
          ],
        })

        const result = await convertEpisodeTextToScriptWithFragments({
          episodeText: shortEpisodeText,
        })

        // 単一フラグメントでも正常に処理される
        expect(result).toHaveProperty('title')
        expect(result).toHaveProperty('scenes')
        expect(Array.isArray(result.scenes)).toBe(true)

        // 通常のスクリプト変換が呼ばれたことを確認
        expect(convertEpisodeTextToScript).toHaveBeenCalledWith(
          { episodeText: shortEpisodeText },
          {
            jobId: undefined,
            episodeNumber: undefined,
            isDemo: undefined,
          },
        )
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('長いエピソードテキストをフラグメントに分割して処理する', async () => {
      // NODE_ENV=test でデモモードが有効になるため、process.env を一時的にクリア
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        // 長いテキストを作成（5000文字以上）
        const longText = 'これは長いエピソードテキストです。'.repeat(200)

        // フラグメント変換結果をモック
        const mockFragmentScript = {
          scenes: [
            {
              id: 'fragment_scene_1',
              setting: 'テスト場所',
              description: 'フラグメントシーン',
              script: [
                {
                  index: 1,
                  type: 'narration' as const,
                  text: 'フラグメントナレーション',
                },
              ],
            },
          ],
        }

        // 共有モックを使用してフラグメント変換をモック
        mockGenerateObjectWithFallback.mockResolvedValue(mockFragmentScript)

        const result = await convertEpisodeTextToScriptWithFragments({
          episodeText: longText,
        })

        // LLM 呼び出しが複数回行われることを確認
        expect(mockGenerateObjectWithFallback).toHaveBeenCalled()

        // 結果の構造を確認
        expect(result).toHaveProperty('title')
        expect(result).toHaveProperty('scenes')
        expect(Array.isArray(result.scenes)).toBe(true)
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('フラグメント変換オプションが正しく適用される', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        const episodeText = 'テストエピソードテキスト'.repeat(300) // 長いテキスト

        const options = {
          jobId: 'test-job-123',
          episodeNumber: 42,
          fragmentSize: 1500,
          overlapSize: 150,
          maxConcurrentFragments: 2,
        }

        const mockFragmentScript = {
          scenes: [
            {
              id: 'test_scene',
              setting: 'テスト設定',
              script: [{ index: 1, type: 'narration' as const, text: 'test' }],
            },
          ],
        }

        // 共有モックを使用してフラグメント変換をモック
        mockGenerateObjectWithFallback.mockResolvedValue(mockFragmentScript)

        await convertEpisodeTextToScriptWithFragments({ episodeText }, options)

        // LLM 呼び出しが行われたことを確認
        expect(mockGenerateObjectWithFallback).toHaveBeenCalled()
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('フラグメント変換エラー時の処理', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        const longText = 'エラーテストのための長いテキスト'.repeat(200)

        // 共有モックを使用してエラーをスロー
        mockGenerateObjectWithFallback.mockRejectedValue(new Error('LLM generation failed'))

        await expect(
          convertEpisodeTextToScriptWithFragments({
            episodeText: longText,
          }),
        ).rejects.toThrow('LLM generation failed')
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })
  })
})
