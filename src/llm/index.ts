import { getLLMProviderConfig } from '@/config/llm.config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { LlmClient } from './client'
import { FakeLlmClient } from './fake'
import { wrapWithLlmLogging } from './logging'
import { CerebrasClient, type CerebrasConfig } from './providers/cerebras'
import { GeminiClient, type GeminiConfig } from './providers/gemini'
import { OpenAIClient, type OpenAIConfig } from './providers/openai'
import { OpenAICompatibleClient, type OpenAICompatibleConfig } from './providers/openai-compatible'

export type LLMProvider = 'openai' | 'gemini' | 'groq' | 'grok' | 'openrouter' | 'cerebras' | 'fake'

export interface LlmFactoryConfig {
  provider: LLMProvider
  apiKey?: string
  model?: string
  baseUrl?: string
  timeout?: number
}

/**
 * LLMクライアントファクトリー
 * 設定に基づいて適切なLLMクライアントを作成します
 */
export function createLlmClient(config: LlmFactoryConfig): LlmClient {
  switch (config.provider) {
    case 'openai': {
      const openaiConfig: OpenAIConfig = {
        apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
        model: config.model,
        baseUrl: config.baseUrl,
        timeout: config.timeout,
      }
      return wrapWithLlmLogging(new OpenAIClient(openaiConfig))
    }

    case 'cerebras': {
      const cerebrasConfig: CerebrasConfig = {
        apiKey: config.apiKey || process.env.CEREBRAS_API_KEY || '',
        model: config.model,
        baseUrl: config.baseUrl,
        timeout: config.timeout,
      }
      return wrapWithLlmLogging(new CerebrasClient(cerebrasConfig))
    }

    case 'gemini': {
      const geminiConfig: GeminiConfig = {
        apiKey: config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
        model: config.model,
        timeout: config.timeout,
      }
      return wrapWithLlmLogging(new GeminiClient(geminiConfig))
    }

    case 'groq': {
      const groqConfig: OpenAICompatibleConfig = {
        apiKey: config.apiKey || process.env.GROQ_API_KEY || '',
        baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
        provider: 'groq',
        model: config.model,
        timeout: config.timeout,
      }
      return wrapWithLlmLogging(new OpenAICompatibleClient(groqConfig))
    }

    case 'grok': {
      const grokConfig: OpenAICompatibleConfig = {
        apiKey: config.apiKey || process.env.XAI_API_KEY || '',
        baseUrl: config.baseUrl || 'https://api.x.ai/v1',
        provider: 'grok',
        model: config.model,
        timeout: config.timeout,
      }
      return wrapWithLlmLogging(new OpenAICompatibleClient(grokConfig))
    }

    case 'openrouter': {
      // openrouterもOpenAI互換のAPIを使用
      const openrouterConfig: OpenAIConfig = {
        apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || '',
        model: config.model,
        baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
        timeout: config.timeout,
      }
      return wrapWithLlmLogging(new OpenAIClient(openrouterConfig))
    }

    case 'fake': {
      return wrapWithLlmLogging(new FakeLlmClient())
    }

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`)
  }
}

/**
 * 設定からLLMクライアントを作成
 * 既存の設定システムと統合
 */
export function createLlmClientFromConfig(provider?: LLMProvider): LlmClient {
  const targetProvider = provider || getDefaultProvider()
  const providerConfig = getLLMProviderConfig(targetProvider)

  return createLlmClient({
    provider: targetProvider,
    apiKey: providerConfig.apiKey,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
    timeout: providerConfig.timeout,
  })
}

/**
 * デフォルトプロバイダーの取得
 * テスト環境ではfakeを使用
 */
export function getDefaultProvider(): LLMProvider {
  if (process.env.NODE_ENV === 'test') {
    return 'fake'
  }
  return 'cerebras'
}

/**
 * フォールバックチェーンを使用したLLMクライアントの作成
 * エラー時に次のプロバイダーを試行
 */
export async function createLlmClientWithFallback(
  providers: LLMProvider[] = ['cerebras', 'openai', 'gemini'],
): Promise<LlmClient> {
  for (const provider of providers) {
    try {
      const client = createLlmClientFromConfig(provider)
      // 簡単な接続テスト
      await client.chat([{ role: 'user', content: 'Hello' }], {
        maxTokens: 10,
      })
      return client
    } catch (error) {
      getLogger()
        .withContext({ service: 'llm-factory', provider })
        .warn('llm_provider_init_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }

  throw new Error(`All LLM providers failed: ${providers.join(', ')}`)
}

// エクスポート
export * from './client'
export * from './fake'
export * from './providers/cerebras'
export * from './providers/gemini'
export * from './providers/openai'
export * from './providers/openai-compatible'
export * from './structured-client'
export * from './zod-helper'
