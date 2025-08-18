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
  // Tests should use Gemini to avoid expensive or flaky external calls
  if (process.env.NODE_ENV === 'test') {
    return 'cerebras'
  }
  return 'cerebras'
}

// Provider fallback chain (first item is primary fallback)
export function getFallbackChain(): LLMProvider[] {
  // Config-driven fallback order
  const chain: LLMProvider[] = ['cerebras', 'groq', 'openrouter', 'openai']
  return chain
}

// Central provider definitions (single source of truth for models/params)
export const providers: Record<LLMProvider, ProviderConfig> = {
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    model: 'qwen-3-235b-a22b-instruct-2507', // Use a known-valid Cerebras chat model to avoid 404
    maxTokens: 8192,
    timeout: 30_000,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash',
    maxTokens: 8192,
    timeout: 30_000,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5-mini', // gpt-5-mini は8月5日に登場したモデルです。モデル指定を間違えているわけではありません
    maxTokens: 8192,
    timeout: 60_000,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-120b',
    maxTokens: 8192,
    timeout: 30_000,
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: 'openai/gpt-oss-120b',
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
