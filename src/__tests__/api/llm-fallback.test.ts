import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProviderWithFallback, getTextAnalysisLLM } from '@/utils/llm-factory'

// モック設定
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    id: 'openai-mock',
    name: 'OpenAI Mock',
  })),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({
    id: 'gemini-mock',
    name: 'Gemini Mock',
  })),
}))

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => ({
    id: 'groq-mock',
    name: 'Groq Mock',
  })),
}))

vi.mock('@/config', () => ({
  getLLMProviderConfig: vi.fn(),
  getLLMFallbackChain: vi.fn(),
  getTextAnalysisConfig: vi.fn(),
}))

vi.mock('@/config/app.config', () => ({
  appConfig: {
    llm: {
      defaultProvider: 'openai' as const,
    },
  },
}))

describe('LLM Fallback Chain Tests', () => {
  let mockGetLLMProviderConfig: any
  let mockGetLLMFallbackChain: any
  let mockGetTextAnalysisConfig: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // モック関数を取得
    const config = await import('@/config')
    mockGetLLMProviderConfig = vi.mocked(config.getLLMProviderConfig)
    mockGetLLMFallbackChain = vi.mocked(config.getLLMFallbackChain)
    mockGetTextAnalysisConfig = vi.mocked(config.getTextAnalysisConfig)

    // デフォルトの設定モック
    mockGetLLMProviderConfig.mockImplementation((provider: string) => {
      const configs: Record<string, any> = {
        openai: {
          apiKey: 'test-openai-key',
          model: 'gpt-4',
          maxTokens: 4000,
        },
        gemini: {
          apiKey: 'test-gemini-key',
          model: 'gemini-pro',
          maxTokens: 4000,
        },
        groq: {
          apiKey: 'test-groq-key',
          model: 'llama2-70b-4096',
          maxTokens: 4000,
        },
      }
      return configs[provider]
    })

    mockGetLLMFallbackChain.mockReturnValue(['openai', 'gemini', 'groq'])

    mockGetTextAnalysisConfig.mockReturnValue({
      provider: 'default',
      systemPrompt: 'あなたは小説の文章を分析するAIです。',
      userPromptTemplate: 'チャンク{{chunkIndex}}の分析: {{chunkText}}',
      maxTokens: 4000,
      modelOverrides: {},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getProviderWithFallback', () => {
    it('最初のプロバイダーが成功した場合、そのプロバイダーを返す', async () => {
      const result = await getProviderWithFallback('openai')

      expect(result.providerName).toBe('openai')
      expect(result.model).toBe('gpt-4')
      expect(result.provider).toBeDefined()
      expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('openai')
    })

    it('最初のプロバイダーが失敗した場合、フォールバックチェーンを試行する', async () => {
      // OpenAIが失敗するように設定
      mockGetLLMProviderConfig.mockImplementation((provider: string) => {
        if (provider === 'openai') {
          return { apiKey: null, model: 'gpt-4', maxTokens: 4000 }
        }
        return {
          apiKey: `test-${provider}-key`,
          model: provider === 'gemini' ? 'gemini-pro' : 'llama2-70b-4096',
          maxTokens: 4000,
        }
      })

      const result = await getProviderWithFallback('openai')

      expect(result.providerName).toBe('gemini')
      expect(result.model).toBe('gemini-pro')
      expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('openai')
      expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('gemini')
    })

    it('全てのプロバイダーが失敗した場合、エラーを投げる', async () => {
      // 全てのプロバイダーが失敗するように設定
      mockGetLLMProviderConfig.mockReturnValue({
        apiKey: null,
        model: 'test-model',
        maxTokens: 4000,
      })

      await expect(getProviderWithFallback('openai')).rejects.toThrow(
        'All LLM providers failed to initialize',
      )
    })

    it('フォールバックチェーンの順序を正しく処理する', async () => {
      mockGetLLMFallbackChain.mockReturnValue(['groq', 'openai', 'gemini'])

      // Groqが失敗するように設定
      mockGetLLMProviderConfig.mockImplementation((provider: string) => {
        if (provider === 'groq') {
          return { apiKey: null, model: 'llama2-70b-4096', maxTokens: 4000 }
        }
        return {
          apiKey: `test-${provider}-key`,
          model: provider === 'openai' ? 'gpt-4' : 'gemini-pro',
          maxTokens: 4000,
        }
      })

      const result = await getProviderWithFallback()

      expect(result.providerName).toBe('openai')
      expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('groq')
      expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('openai')
    })

    it('優先プロバイダーが指定されている場合、それを最初に試行する', async () => {
      mockGetLLMFallbackChain.mockReturnValue(['openai', 'gemini', 'groq'])

      const result = await getProviderWithFallback('gemini')

      expect(result.providerName).toBe('gemini')
      expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('gemini')
    })
  })

  describe('getTextAnalysisLLM', () => {
    it('テキスト分析用の設定で正しいLLMを取得する', async () => {
      const result = await getTextAnalysisLLM()

      expect(result.providerName).toBe('openai')
      expect(result.model).toBe('gpt-4')
      expect(result.settings.maxTokens).toBe(4000)
      expect(result.systemPrompt).toBe('あなたは小説の文章を分析するAIです。')
      expect(mockGetTextAnalysisConfig).toHaveBeenCalled()
    })

    it('モデルオーバーライドが適用される', async () => {
      mockGetTextAnalysisConfig.mockReturnValue({
        provider: 'default',
        systemPrompt: 'あなたは小説の文章を分析するAIです。',
        userPromptTemplate: 'チャンク{{chunkIndex}}の分析: {{chunkText}}',
        maxTokens: 4000,
        modelOverrides: {
          openai: 'gpt-4-turbo',
        },
      })

      const result = await getTextAnalysisLLM()

      expect(result.model).toBe('gpt-4-turbo')
    })

    it('指定されたプロバイダーが使用される', async () => {
      mockGetTextAnalysisConfig.mockReturnValue({
        provider: 'gemini',
        systemPrompt: 'あなたは小説の文章を分析するAIです。',
        userPromptTemplate: 'チャンク{{chunkIndex}}の分析: {{chunkText}}',
        maxTokens: 4000,
        modelOverrides: {},
      })

      const result = await getTextAnalysisLLM()

      expect(result.providerName).toBe('gemini')
      expect(result.model).toBe('gemini-pro')
    })

    it('プロバイダーが失敗した場合フォールバックが動作する', async () => {
      mockGetTextAnalysisConfig.mockReturnValue({
        provider: 'openai',
        systemPrompt: 'あなたは小説の文章を分析するAIです。',
        userPromptTemplate: 'チャンク{{chunkIndex}}の分析: {{chunkText}}',
        maxTokens: 4000,
        modelOverrides: {},
      })

      // OpenAIが失敗するように設定
      mockGetLLMProviderConfig.mockImplementation((provider: string) => {
        if (provider === 'openai') {
          return { apiKey: null, model: 'gpt-4', maxTokens: 4000 }
        }
        return {
          apiKey: `test-${provider}-key`,
          model: provider === 'gemini' ? 'gemini-pro' : 'llama2-70b-4096',
          maxTokens: 4000,
        }
      })

      const result = await getTextAnalysisLLM()

      expect(result.providerName).toBe('gemini')
      expect(result.model).toBe('gemini-pro')
    })
  })

  describe('フォールバックエラーハンドリング', () => {
    it('APIキーが無効な場合、適切なエラーメッセージを出力する', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // コンソール出力を抑制
      })

      mockGetLLMProviderConfig.mockImplementation((provider: string) => {
        if (provider === 'openai') {
          return { apiKey: null, model: 'gpt-4', maxTokens: 4000 }
        }
        return {
          apiKey: `test-${provider}-key`,
          model: provider === 'gemini' ? 'gemini-pro' : 'llama2-70b-4096',
          maxTokens: 4000,
        }
      })

      await getProviderWithFallback('openai')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to initialize provider openai:',
        expect.any(Error),
      )

      consoleWarnSpy.mockRestore()
    })

    it('未知のプロバイダーが指定された場合、適切なエラーを投げる', async () => {
      mockGetLLMFallbackChain.mockReturnValue(['unknown-provider' as any])

      await expect(getProviderWithFallback()).rejects.toThrow(
        'All LLM providers failed to initialize',
      )
    })
  })
})
