// Centralized LLM configuration: providers, defaults, and per-use-case parameters

export type LLMProvider =
  | 'openai'
  | 'gemini'
  | 'groq'
  | 'grok'
  | 'openrouter'
  | 'cerebras'
  | 'vertexai'
  | 'fake'

export interface ProviderConfig {
  apiKey?: string
  model: string
  maxTokens: number
  timeout: number
  baseUrl?: string
  // OpenRouter specific: prefer Cerebras backend when available for the model
  preferCerebras?: boolean
  // Vertex AI specific configuration
  vertexai?: {
    project?: string
    location?: string
    serviceAccountPath?: string
  }
}

// Per-use-case parameters have been removed.

// Use-case aware provider selection (centralized, configurable)
export type LLMUseCase =
  | 'chunkConversion'
  | 'scriptConversion'
  | 'coverageJudge'
  | 'textAnalysis'
  | 'pageBreak'
  | 'panelAssignment'
  | 'episodeBreak'

// Mapping for use-case specific provider preferences.
// NOTE: Do not hardcode in application code; change preferences here.
const useCaseProviders: Partial<Record<LLMUseCase, LLMProvider>> = {
  // 指示: チャンク変換・スクリプト変換には高性能なLLMを使用
  chunkConversion: 'vertexai',
  // エピソード切れ目検出もVertex AI（Gemini）を使用
  episodeBreak: 'vertexai',
  // その他はデフォルト（groq）を使用
}

export function getProviderForUseCase(useCase: LLMUseCase): LLMProvider {
  // Optional environment override: LLM_PROVIDER_SCRIPTCONVERSION=openai 等
  const envKey = `LLM_PROVIDER_${useCase.toUpperCase()}`
  const envVal = process.env[envKey]
  if (
    envVal &&
    ['openai', 'gemini', 'groq', 'grok', 'openrouter', 'cerebras', 'vertexai', 'fake'].includes(
      envVal,
    )
  ) {
    return envVal as LLMProvider
  }
  // テスト環境では明示的な指定が無ければ fake を使用
  if (process.env.NODE_ENV === 'test') {
    return 'fake'
  }
  return useCaseProviders[useCase] ?? getDefaultProvider()
}

// Default provider (config-driven only; no environment variable overrides)
export function getDefaultProvider(): LLMProvider {
  // Tests should use fake provider to avoid expensive or flaky external calls
  if (process.env.NODE_ENV === 'test') {
    return 'fake'
  }
  return 'vertexai'
}

// Provider fallback chain (first item is primary fallback)
export function getFallbackChain(): LLMProvider[] {
  // Config-driven fallback order
  const chain: LLMProvider[] = ['groq', 'openrouter', 'openai']
  return chain
}

// Central provider definitions (single source of truth for models/params)
export const providers: Record<LLMProvider, ProviderConfig> = {
  vertexai: {
    model: 'gemini-2.5-pro',
    maxTokens: 32768,
    timeout: 60_000,
    // NOTE:
    // - 環境変数の検証は実際に Vertex AI プロバイダーを使用する直前
    //   (getLLMProviderConfig('vertexai') 呼び出し時) に遅延実行する。
    // - ここで環境変数を即時参照して throw すると、テスト環境で
    //   単に本モジュールを import しただけで失敗してしまうため禁止。
    // - 値はプレースホルダで初期化し、実使用時に上書き・検証する。
    vertexai: {
      project: undefined,
      location: undefined,
      serviceAccountPath: undefined,
    },
  },
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    // Structured outputs対応が安定している公開モデルに合わせる（ドキュメント例に準拠）
    model: 'llama-4-scout-17b-16e-instruct',
    maxTokens: 8192,
    timeout: 30_000,
  },
  gemini: {
    model: 'gemini-2.5-flash',
    maxTokens: 16000,
    timeout: 30_000,
    vertexai: {
      project: undefined,
      location: undefined,
      serviceAccountPath: undefined,
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5', // gpt-5-nano は8月5日に登場したモデルです。モデル指定を間違えているわけではありません
    maxTokens: 128000,
    timeout: 60_000,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-120b',
    // Script conversion token limit reduced to prevent generation failure
    maxTokens: 16000,
    timeout: 30_000,
  },
  grok: {
    apiKey: process.env.XAI_API_KEY,
    model: 'grok-4',
    baseUrl: 'https://api.x.ai/v1',
    maxTokens: 32768,
    timeout: 60_000,
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: 'deepseek/deepseek-chat-v3.1:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    maxTokens: 8192,
    timeout: 30_000,
    preferCerebras: true,
  },
  fake: {
    apiKey: 'fake-key',
    model: 'fake-model',
    maxTokens: 8192,
    timeout: 30_000,
  },
}

// Per-use-case parameters have been removed. Use `providers` as the single source of truth.

// Accessors used by the rest of the app through src/config/index.ts
export function getLLMDefaultProvider(): LLMProvider {
  return getDefaultProvider()
}

export function getLLMFallbackChain(): LLMProvider[] {
  return getFallbackChain()
}

export function getLLMProviderConfig(provider: LLMProvider): ProviderConfig {
  const cfg = providers[provider]
  if (!cfg) {
    throw new Error(`Unknown LLM provider: ${provider}`)
  }

  // IMPORTANT: Read API keys lazily at call time so tests can set env in beforeAll.
  // Do not capture process.env at module load.
  const dynamicApiKey = (() => {
    switch (provider) {
      case 'cerebras':
        return process.env.CEREBRAS_API_KEY
      case 'openai':
        return process.env.OPENAI_API_KEY
      case 'groq':
        return process.env.GROQ_API_KEY
      case 'grok':
        return process.env.XAI_API_KEY
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY
      case 'gemini':
        // Gemini 2.5 は Vertex AI のみ対応
        return 'vertex-ai-auth'
      case 'vertexai':
        // Vertex AI uses service account authentication, not API keys
        return 'vertex-ai-auth'
      case 'fake':
        return 'fake-key'
      default:
        return undefined
    }
  })()

  // Return a fresh object; keep model/token config from the static table.
  const modelOverride = (() => {
    switch (provider) {
      case 'cerebras':
        return process.env.CEREBRAS_MODEL
      case 'openai':
        return process.env.OPENAI_MODEL
      case 'groq':
        return process.env.GROQ_MODEL
      case 'grok':
        return process.env.GROK_MODEL
      case 'openrouter':
        return process.env.OPENROUTER_MODEL
      case 'gemini':
        return process.env.GEMINI_MODEL
      case 'vertexai':
        return process.env.VERTEX_AI_MODEL
      default:
        return undefined
    }
  })()

  // Vertex AI はここで実際の環境変数を読み込み・検証する（遅延検証）
  if (provider === 'vertexai' || provider === 'gemini') {
    const project = process.env.VERTEX_AI_PROJECT
    const location = process.env.VERTEX_AI_LOCATION
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

    // テストでは Vertex を使わない前提だが、もし明示的に Vertex を選んだ場合は
    // ここで欠落を厳密に検出してエラーにする（フォールバック禁止）。
    if (!project || !location || !serviceAccountPath) {
      const missing = [
        !project ? 'VERTEX_AI_PROJECT' : undefined,
        !location ? 'VERTEX_AI_LOCATION' : undefined,
        !serviceAccountPath ? 'GOOGLE_APPLICATION_CREDENTIALS' : undefined,
      ]
        .filter(Boolean)
        .join(', ')
      throw new Error(`Missing required environment for Vertex AI: ${missing}`)
    }

    const ensuredProject = project
    const ensuredLocation = location

    return {
      ...cfg,
      apiKey: dynamicApiKey,
      model: modelOverride && modelOverride.trim().length > 0 ? modelOverride : cfg.model,
      vertexai: {
        project: ensuredProject,
        location: ensuredLocation,
        serviceAccountPath,
      },
    }
  }

  return {
    ...cfg,
    apiKey: dynamicApiKey,
    model: modelOverride && modelOverride.trim().length > 0 ? modelOverride : cfg.model,
  }
}

// Accessor for per-use-case parameters has been removed. Use provider config instead.

// Model limits configuration (integrated from llm.limits.ts)
export type ModelLimits = {
  hardCap: number
  softCapDefault: number
  minCompletion: number
}

export function getModelLimits(provider: LLMProvider, _model: string): ModelLimits {
  // Use the maxTokens from provider config as the limits
  const config = providers[provider]
  const maxTokens = config.maxTokens

  return {
    hardCap: maxTokens,
    softCapDefault: maxTokens,
    minCompletion: Math.min(96, maxTokens),
  }
}
