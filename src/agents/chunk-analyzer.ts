import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import { getCurrentLLMProvider, getTextAnalysisConfig } from '@/config'

// 設定を取得
function getModel() {
  const { provider, config: providerConfig } = getCurrentLLMProvider()

  switch (provider) {
    case 'openai': {
      const openaiKey = providerConfig.apiKey
      const openaiModel = providerConfig.model
      if (!openaiKey) throw new Error('OpenAI API key not configured')
      return openai(openaiModel)
    }
    case 'claude': {
      const claudeKey = providerConfig.apiKey
      const claudeModel = providerConfig.model
      if (!claudeKey) throw new Error('Claude API key not configured')

      // 環境変数を設定してantropic関数を使用
      process.env.ANTHROPIC_API_KEY = claudeKey
      return anthropic(claudeModel)
    }
    case 'gemini': {
      // Geminiサポートは将来的に追加
      throw new Error('Gemini provider is not yet supported')
    }
    case 'groq': {
      // Groqサポートは将来的に追加
      throw new Error('Groq provider is not yet supported')
    }
    default: {
      // デフォルトはOpenAIにフォールバック
      const { config: fallbackConfig } = getCurrentLLMProvider()
      const openaiKey = fallbackConfig.apiKey
      if (!openaiKey) throw new Error('Default provider API key not configured')
      return openai(fallbackConfig.model)
    }
  }
}

export const chunkAnalyzerAgent = new Agent({
  name: 'chunk-analyzer',
  description:
    '小説のチャンクを分析して、キャラクター、場面、対話、ハイライト、状況を抽出するエージェント',
  instructions: () => {
    const config = getTextAnalysisConfig()
    return config.systemPrompt
  },
  model: ({ runtimeContext: _runtimeContext }) => {
    // プロバイダー設定を取得してモデルを返す
    const model = getModel()
    return model as any // Mastraの型互換性のための一時的な回避策
  },
})
