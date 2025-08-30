import type { LlmProvider } from './types'

export type OpenAICompatProvider = Extract<
  LlmProvider,
  'openai' | 'groq' | 'grok' | 'openrouter' | 'gemini'
>

export function defaultBaseUrl(provider: OpenAICompatProvider): string {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'grok':
      return 'https://api.x.ai/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}

export function resolveBaseUrl(provider: LlmProvider, baseUrlFromConfig?: string): string {
  if (typeof baseUrlFromConfig === 'string' && baseUrlFromConfig.trim().length > 0) {
    return baseUrlFromConfig
  }
  // OpenAI 互換系のみデフォルトURLを返す。それ以外（cerebras/fake）は不定。
  if (provider === 'cerebras' || provider === 'fake') return 'unknown'
  return defaultBaseUrl(provider as OpenAICompatProvider)
}
