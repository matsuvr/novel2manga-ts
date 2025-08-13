// Centralized LLM configuration: providers, defaults, and per-use-case parameters

export type LLMProvider = 'openai' | 'gemini' | 'groq' | 'claude' | 'openrouter'

export interface ProviderConfig {
  apiKey?: string
  model: string
  maxTokens: number
  timeout: number
  baseUrl?: string
  // OpenRouter specific: prefer Cerebras backend when available for the model
  preferCerebras?: boolean
}

export interface UseCaseParams {
  // 'default' means use defaultProvider
  provider: 'default' | LLMProvider
  // Max output tokens limit for the use-case
  maxTokens: number
  // Optional per-provider model override for the use-case
  modelOverrides?: Partial<Record<LLMProvider, string>>
}

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
    model: 'gpt-5-mini',
    maxTokens: 4096,
    timeout: 60_000,
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    timeout: 30_000,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
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

// Per-use-case parameters (models and token limits centralized here)
export const useCaseParams: Record<
  'textAnalysis' | 'narrativeArcAnalysis' | 'layoutGeneration' | 'chunkBundleAnalysis',
  UseCaseParams
> = {
  textAnalysis: {
    provider: 'default',
    maxTokens: 8192,
    modelOverrides: {
      openai: 'gpt-5-mini',
      claude: 'claude-sonnet-4-20250514',
      gemini: 'gemini-2.5-flash',
      groq: 'openai/gpt-oss-120b',
      // Cerebras対応の場合はファクトリ側で自動変換
      openrouter: 'openai/gpt-oss-120b',
    },
  },
  narrativeArcAnalysis: {
    provider: 'default',
    maxTokens: 4096,
    modelOverrides: {
      openai: 'gpt-5-mini',
      claude: 'claude-sonnet-4-20250514',
      gemini: 'gemini-2.5-flash',
      groq: 'openai/gpt-oss-120b',
      openrouter: 'openai/gpt-oss-120b',
    },
  },
  layoutGeneration: {
    provider: 'default',
    maxTokens: 4096,
    modelOverrides: {
      openai: 'gpt-5-mini',
      claude: 'claude-sonnet-4-20250514',
      gemini: 'gemini-2.5-flash',
      groq: 'openai/gpt-oss-120b',
      openrouter: 'openai/gpt-oss-120b',
    },
  },
  chunkBundleAnalysis: {
    provider: 'default',
    maxTokens: 8192,
    modelOverrides: {
      openai: 'gpt-5-mini',
      claude: 'claude-sonnet-4-20250514',
      gemini: 'gemini-2.5-flash',
      groq: 'openai/gpt-oss-120b',
      openrouter: 'openai/gpt-oss-120b',
    },
  },
}

// Accessors used by the rest of the app through src/config/index.ts
export function getLLMDefaultProvider(): LLMProvider {
  return getDefaultProvider()
}

export function getLLMFallbackChain(): LLMProvider[] {
  return getFallbackChain()
}

export function getLLMProviderConfig(provider: LLMProvider): ProviderConfig {
  return providers[provider]
}

export function getUseCaseParams(useCase: keyof typeof useCaseParams): UseCaseParams {
  return useCaseParams[useCase]
}
