import type { LlmProvider } from './types'

export type OpenAICompatProvider = Extract<LlmProvider, 'openai' | 'groq' | 'grok' | 'openrouter'>

export function defaultBaseUrl(provider: OpenAICompatProvider): string {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'grok':
      return 'https://api.x.ai/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}

export function resolveBaseUrl(provider: LlmProvider, baseUrlFromConfig?: string): string {
  if (typeof baseUrlFromConfig === 'string' && baseUrlFromConfig.trim().length > 0) {
    return baseUrlFromConfig
  }
  // OpenAI 互換系のみデフォルトURLを返す。それ以外（cerebras/fake/gemini/vertexai）は不定。
  if (provider === 'fake' || provider === 'gemini' || provider === 'vertexai') {
    return 'unknown'
  }
  return defaultBaseUrl(provider as OpenAICompatProvider)
}
