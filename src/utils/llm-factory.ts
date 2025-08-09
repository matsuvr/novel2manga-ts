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
  getLLMDefaultProvider,
} from '@/config'

// 型定義
type LLMProvider = 'openai' | 'gemini' | 'groq' | 'openrouter' | 'claude'

interface ProviderConfig {
  apiKey?: string
  model: string
  maxTokens: number
  timeout: number
  baseUrl?: string
  preferCerebras?: boolean // OpenRouter特有：Cerebrasプロバイダーを優先するかどうか
}

interface LLMConfig {
  provider: 'default' | LLMProvider
  maxTokens: number
  modelOverrides?: Partial<Record<LLMProvider, string>>
  systemPrompt: string
  userPromptTemplate?: string
}

// OpenRouterモデルのCerebras対応マップ
const CEREBRAS_MODEL_MAP: Record<string, string> = {
  'qwen/qwen3-235b-a22b-thinking-2507': 'cerebras/qwen-3-235b-a22b-thinking-2507',
  'qwen/qwen-3-235b-a22b-thinking-2507': 'cerebras/qwen-3-235b-a22b-thinking-2507',
  'qwen/qwen3-235b-a22b-instruct-2507': 'cerebras/qwen-3-235b-a22b-instruct-2507',
  'qwen/qwen-3-235b-a22b-instruct-2507': 'cerebras/qwen-3-235b-a22b-instruct-2507',
  'qwen/qwen-3-32b': 'cerebras/qwen-3-32b',
  'qwen/qwen-3-coder-480b': 'cerebras/qwen-3-coder-480b',
  'meta-llama/llama-3.3-70b': 'cerebras/llama-3.3-70b',
  'meta-llama/llama-3.1-8b': 'cerebras/llama3.1-8b',
  'openai/o1': 'cerebras/gpt-oss-120b',
} as const

// Cerebras対応モデルを取得する関数
function getCerebrasModel(originalModel: string): string | null {
  return CEREBRAS_MODEL_MAP[originalModel] || null
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

  // テスト環境では API key がなくても動作するように
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST

  // デバッグ情報
  console.log(`[DEBUG] Provider: ${provider}`)
  console.log(`[DEBUG] Config:`, config)
  console.log(`[DEBUG] API Key exists:`, !!config.apiKey)
  console.log(`[DEBUG] API Key length:`, config.apiKey?.length || 0)
  console.log(`[DEBUG] Test environment:`, isTestEnv)

  if (!config.apiKey && !isTestEnv) {
    throw new Error(`API key not found for provider: ${provider}`)
  }

  // テスト環境では dummy API key を使用
  const apiKey = config.apiKey || (isTestEnv ? 'test-api-key' : undefined)

  if (!apiKey) {
    throw new Error(`API key not found for provider: ${provider}`)
  }

  switch (provider) {
    case 'openai':
      if (!providerCache.openai) {
        providerCache.openai = createOpenAI({
          apiKey,
        })
      }
      return providerCache.openai

    case 'gemini':
      if (!providerCache.gemini) {
        providerCache.gemini = createGoogleGenerativeAI({
          apiKey,
        })
      }
      return providerCache.gemini

    case 'groq':
      if (!providerCache.groq) {
        providerCache.groq = createGroq({
          apiKey,
        })
      }
      return providerCache.groq

    case 'openrouter':
      if (!providerCache.openrouter) {
        const providerConfig = config as ProviderConfig
        const baseURL = providerConfig.baseUrl || 'https://openrouter.ai/api/v1'

        // Cerebras対応の場合はextraBodyでプロバイダールーティングを設定
        const cerebrasModel = getCerebrasModel(providerConfig.model)
        const shouldUseCerebras = providerConfig.preferCerebras && cerebrasModel

        const openrouterConfig: any = {
          apiKey,
          baseURL,
        }

        // Cerebrasを優先する場合は、extraBodyでプロバイダールーティングを指定
        if (shouldUseCerebras) {
          console.log(
            `[DEBUG] Cerebras routing enabled for model: ${providerConfig.model} -> ${cerebrasModel}`,
          )
          openrouterConfig.fetch = async (url: string, options: any) => {
            // リクエストボディにprovider routingを追加
            if (options?.body) {
              const body = JSON.parse(options.body)
              body.provider = {
                order: ['cerebras'],
              }
              options.body = JSON.stringify(body)
            }
            return fetch(url, options)
          }
        }

        providerCache.openrouter = createOpenAI(openrouterConfig)
      }
      return providerCache.openrouter

    case 'claude':
      if (!providerCache.claude) {
        // ClaudeはAnthropicのAPIを使用
        providerCache.claude = createOpenAI({
          apiKey,
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
    config.provider === 'default' ? getLLMDefaultProvider() : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  let model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  // OpenRouterでCerebras対応が有効な場合、Cerebrasモデルを使用
  if (llmInstance.providerName === 'openrouter' && (llmInstance.config as any).preferCerebras) {
    const cerebrasModel = getCerebrasModel(model)
    if (cerebrasModel) {
      console.log(
        `[DEBUG] Switching to Cerebras model for text analysis: ${model} -> ${cerebrasModel}`,
      )
      model = cerebrasModel
    }
  }

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
    config.provider === 'default' ? getLLMDefaultProvider() : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  let model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  // OpenRouterでCerebras対応が有効な場合、Cerebrasモデルを使用
  if (llmInstance.providerName === 'openrouter' && (llmInstance.config as any).preferCerebras) {
    const cerebrasModel = getCerebrasModel(model)
    if (cerebrasModel) {
      console.log(
        `[DEBUG] Switching to Cerebras model for narrative analysis: ${model} -> ${cerebrasModel}`,
      )
      model = cerebrasModel
    }
  }

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
    config.provider === 'default' ? getLLMDefaultProvider() : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  let model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  // OpenRouterでCerebras対応が有効な場合、Cerebrasモデルを使用
  if (llmInstance.providerName === 'openrouter' && (llmInstance.config as any).preferCerebras) {
    const cerebrasModel = getCerebrasModel(model)
    if (cerebrasModel) {
      console.log(
        `[DEBUG] Switching to Cerebras model for layout generation: ${model} -> ${cerebrasModel}`,
      )
      model = cerebrasModel
    }
  }

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
    config.provider === 'default' ? getLLMDefaultProvider() : config.provider

  const llmInstance = await getProviderWithFallback(preferredProvider)

  // モデルオーバーライドがあれば適用
  let model = config.modelOverrides?.[llmInstance.providerName] || llmInstance.model

  // OpenRouterでCerebras対応が有効な場合、Cerebrasモデルを使用
  if (llmInstance.providerName === 'openrouter' && (llmInstance.config as any).preferCerebras) {
    const cerebrasModel = getCerebrasModel(model)
    if (cerebrasModel) {
      console.log(
        `[DEBUG] Switching to Cerebras model for chunk bundle analysis: ${model} -> ${cerebrasModel}`,
      )
      model = cerebrasModel
    }
  }

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
  const preferredProvider = overrides?.provider || getLLMDefaultProvider()
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
