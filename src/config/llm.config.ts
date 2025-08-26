// Centralized LLM configuration: providers, defaults, and per-use-case parameters

export type LLMProvider = 'openai' | 'gemini' | 'groq' | 'openrouter' | 'cerebras' | 'fake'

export interface ProviderConfig {
  apiKey?: string
  model: string
  maxTokens: number
  timeout: number
  baseUrl?: string
  // OpenRouter specific: prefer Cerebras backend when available for the model
  preferCerebras?: boolean
}

// Per-use-case parameters have been removed.

// Default provider (config-driven only; no environment variable overrides)
export function getDefaultProvider(): LLMProvider {
  // Tests should use fake provider to avoid expensive or flaky external calls
  if (process.env.NODE_ENV === 'test') {
    return 'fake'
  }
  return 'groq'
}

// Provider fallback chain (first item is primary fallback)
export function getFallbackChain(): LLMProvider[] {
  // Config-driven fallback order
  const chain: LLMProvider[] = ['groq', 'openrouter', 'openai']
  return chain
}

// Central provider definitions (single source of truth for models/params)
export const providers: Record<LLMProvider, ProviderConfig> = {
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    // Structured outputs対応が安定している公開モデルに合わせる（ドキュメント例に準拠）
    model: 'llama-4-scout-17b-16e-instruct',
    maxTokens: 8192,
    timeout: 30_000,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash-lite',
    maxTokens: 4096,
    timeout: 30_000,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5-nano', // gpt-5-nano は8月5日に登場したモデルです。モデル指定を間違えているわけではありません
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
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: 'mistralai/mistral-small-3.2-24b-instruct:free',
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
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY
      case 'gemini':
        return process.env.GEMINI_API_KEY
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
      case 'openrouter':
        return process.env.OPENROUTER_MODEL
      case 'gemini':
        return process.env.GEMINI_MODEL
      default:
        return undefined
    }
  })()

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

// 集中管理: モデルごとの出力上限や既定ソフト上限をここで定義
export function getModelLimits(provider: string, model: string): ModelLimits {
  // 既定値（環境で上書き可）
  const _defaultSoftCap = toNum(process.env.GROQ_SOFT_CAP) ?? 60000
  const defaultMin = toNum(process.env.GROQ_MIN_COMPLETION) ?? 512

  if (provider === 'groq') {
    // GPT-OSS 120B は理論上 65535
    if (/gpt-oss-120b/i.test(model)) {
      return {
        hardCap: 65535,
        softCapDefault: toNum(process.env.GROQ_SOFT_CAP) ?? 60000,
        minCompletion: defaultMin,
      }
    }
    // GPT-OSS 20B などその他Groqモデル
    return {
      hardCap: toNum(process.env.GROQ_MAX_TOKENS) ?? 8192,
      softCapDefault: toNum(process.env.GROQ_SOFT_CAP) ?? 8192,
      minCompletion: defaultMin,
    }
  }
  return {
    hardCap: toNum(process.env.LLM_MAX_TOKENS) ?? Number.MAX_SAFE_INTEGER,
    softCapDefault: toNum(process.env.LLM_SOFT_CAP) ?? 8192,
    minCompletion: toNum(process.env.LLM_MIN_COMPLETION) ?? 512,
  }
}

function toNum(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
