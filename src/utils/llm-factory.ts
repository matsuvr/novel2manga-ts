import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import {
  getChunkBundleAnalysisConfig,
  getLayoutGenerationConfig,
  getLLMFallbackChain,
  getLLMProviderConfig,
  getNarrativeAnalysisConfig,
  getTextAnalysisConfig,
} from '@/config'
import { appConfig } from '@/config/app.config'

// 型定義
type LLMProvider = 'openai' | 'gemini' | 'groq' | 'openrouter' | 'claude'

interface ProviderConfig {
  apiKey?: string
  model: string
  maxTokens: number
  timeout: number
  baseUrl?: string
}

interface LLMConfig {
  provider: 'default' | LLMProvider
  maxTokens: number
  modelOverrides?: Partial<Record<LLMProvider, string>>
  systemPrompt: string
  userPromptTemplate?: string
}

// プロバイダーインスタンスのキャッシュ
const providerCache = {
  openai: null as ReturnType<typeof createOpenAI> | null,
  gemini: null as ReturnType<typeof createGoogleGenerativeAI> | null,
  groq: null as ReturnType<typeof createGroq> | null,
  openrouter: null as ReturnType<typeof createOpenAI> | null,
  claude: null as ReturnType<typeof createOpenAI> | null,
}

// プロバイダーインスタンスを取得
function getProviderInstance(provider: LLMProvider) {
  const config = getLLMProviderConfig(provider)

  // デバッグ情報
  console.log(`[DEBUG] Provider: ${provider}`)
  console.log(`[DEBUG] Config:`, config)
  console.log(`[DEBUG] API Key exists:`, !!config.apiKey)
  console.log(`[DEBUG] API Key length:`, config.apiKey?.length || 0)

  if (!config.apiKey) {
    throw new Error(`API key not found for provider: ${provider}`)
  }

  switch (provider) {
    case 'openai':
      if (!providerCache.openai) {
        providerCache.openai = createOpenAI({
          apiKey: config.apiKey,
        })
      }
      return providerCache.openai

    case 'gemini':
      if (!providerCache.gemini) {
        providerCache.gemini = createGoogleGenerativeAI({
          apiKey: config.apiKey,
        })
      }
      return providerCache.gemini

    case 'groq':
      if (!providerCache.groq) {
        providerCache.groq = createGroq({
          apiKey: config.apiKey,
        })
      }
      return providerCache.groq

    case 'openrouter':
      if (!providerCache.openrouter) {
        providerCache.openrouter = createOpenAI({
          apiKey: config.apiKey,
          baseURL: (config as ProviderConfig).baseUrl || 'https://openrouter.ai/api/v1',
        })
      }
      return providerCache.openrouter

    case 'claude':
      if (!providerCache.claude) {
        // ClaudeはAnthropicのAPIを使用
        providerCache.claude = createOpenAI({
          apiKey: config.apiKey,
          baseURL: 'https://api.anthropic.com/v1',
        })
      }
      return providerCache.claude

    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// フォールバック機能付きでプロバイダーを取得
export async function getProviderWithFallback(preferredProvider?: LLMProvider) {
  const fallbackChain = getLLMFallbackChain()
  const providersToTry = preferredProvider
    ? [preferredProvider, ...fallbackChain.filter((p) => p !== preferredProvider)]
    : fallbackChain

  let lastError: Error | null = null

  for (const provider of providersToTry) {
    try {
      const providerInstance = getProviderInstance(provider)
      const config = getLLMProviderConfig(provider)

      // 簡単な接続テスト（optional）
      // await testConnection(providerInstance, config.model)

      return {
        provider: providerInstance,
        providerName: provider,
        model: config.model,
        config,
      }
    } catch (error) {
      lastError = error as Error
      console.warn(`Failed to initialize provider ${provider}:`, error)
    }
  }

  throw new Error(`All LLM providers failed to initialize. Last error: ${lastError?.message}`)
}

// テキスト分析用のLLMを取得（フォールバック対応）
export async function getTextAnalysisLLM() {
  const config = getTextAnalysisConfig() as LLMConfig

  // デフォルトプロバイダーを使用するか、指定されたプロバイダーを使用
  const preferredProvider: LLMProvider =
    config.provider === 'default' ? appConfig.llm.defaultProvider : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  const model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  return {
    provider: llmInstance.provider,
    providerName: llmInstance.providerName,
    model,
    settings: {
      maxTokens: config.maxTokens,
    },
    systemPrompt: config.systemPrompt,
  }
}

// 物語弧分析用のLLMを取得（フォールバック対応）
export async function getNarrativeAnalysisLLM() {
  const config = getNarrativeAnalysisConfig() as LLMConfig

  // デフォルトプロバイダーを使用するか、指定されたプロバイダーを使用
  const preferredProvider: LLMProvider =
    config.provider === 'default' ? appConfig.llm.defaultProvider : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  const model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  return {
    provider: llmInstance.provider,
    providerName: llmInstance.providerName,
    model,
    settings: {
      maxTokens: config.maxTokens,
    },
    systemPrompt: config.systemPrompt,
    userPromptTemplate: config.userPromptTemplate,
  }
}

// レイアウト生成用のLLMを取得（フォールバック対応）
export async function getLayoutGenerationLLM() {
  const config = getLayoutGenerationConfig() as LLMConfig

  // デフォルトプロバイダーを使用するか、指定されたプロバイダーを使用
  const preferredProvider: LLMProvider =
    config.provider === 'default' ? appConfig.llm.defaultProvider : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  const model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  return {
    provider: llmInstance.provider,
    providerName: llmInstance.providerName,
    model,
    settings: {
      maxTokens: config.maxTokens,
    },
    systemPrompt: config.systemPrompt,
  }
}

// チャンクバンドル統合分析用のLLMを取得（フォールバック対応）
export async function getChunkBundleAnalysisLLM() {
  const config = getChunkBundleAnalysisConfig() as LLMConfig

  // デフォルトプロバイダーを使用するか、指定されたプロバイダーを使用
  const preferredProvider: LLMProvider =
    config.provider === 'default' ? appConfig.llm.defaultProvider : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  const model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  return {
    provider: llmInstance.provider,
    providerName: llmInstance.providerName,
    model,
    settings: {
      maxTokens: config.maxTokens,
    },
    systemPrompt: config.systemPrompt,
    userPromptTemplate: config.userPromptTemplate,
  }
}

// 汎用LLMを取得（カスタム設定用）
export async function getLLM(
  useCase:
    | 'textAnalysis'
    | 'narrativeAnalysis'
    | 'layoutGeneration'
    | 'chunkBundleAnalysis'
    | 'custom' = 'custom',
  overrides?: {
    provider?: LLMProvider
    model?: string
    maxTokens?: number
    systemPrompt?: string
  },
) {
  if (useCase === 'textAnalysis') {
    return getTextAnalysisLLM()
  }

  if (useCase === 'narrativeAnalysis') {
    return getNarrativeAnalysisLLM()
  }

  if (useCase === 'layoutGeneration') {
    return getLayoutGenerationLLM()
  }

  if (useCase === 'chunkBundleAnalysis') {
    return getChunkBundleAnalysisLLM()
  }

  // カスタム設定
  const preferredProvider = overrides?.provider || appConfig.llm.defaultProvider
  const llmInstance = await getProviderWithFallback(preferredProvider)

  return {
    provider: llmInstance.provider,
    providerName: llmInstance.providerName,
    model: overrides?.model || llmInstance.model,
    settings: {
      maxTokens: overrides?.maxTokens || llmInstance.config.maxTokens,
    },
    systemPrompt: overrides?.systemPrompt || '',
  }
}
