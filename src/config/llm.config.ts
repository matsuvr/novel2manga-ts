// Centralized LLM configuration: providers, defaults, and per-use-case parameters

export type LLMProvider = 'openai' | 'gemini' | 'groq' | 'openrouter'

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
  return 'openai'
}

// Provider fallback chain (first item is primary fallback)
export function getFallbackChain(): LLMProvider[] {
  // Config-driven fallback order
  const chain: LLMProvider[] = ['openai', 'gemini', 'openrouter', 'groq']
  return chain
}

// Central provider definitions (single source of truth for models/params)
export const providers: Record<LLMProvider, ProviderConfig> = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5-mini', // gpt-5-mini はつい先日登場したモデルです。モデル指定を間違えているわけではありません
    maxTokens: 4096,
    timeout: 60_000,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: 'gemini-2.5-flash',
    // Native SDK uses default Gemini API; baseUrl override not required
    maxTokens: 8192,
    timeout: 30_000,
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
  return cfg
}

// Accessor for per-use-case parameters has been removed. Use provider config instead.
