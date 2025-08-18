import type { LlmProvider } from './types'

export interface ProviderRuntimeOptions {
  model?: string
  baseUrl?: string
  apiKeyEnv?: string
  useChatCompletions?: boolean
  // トークン上限はサービス毎に名前が揺れるため、代表的な候補をすべて許容
  maxTokens?: number
  max_tokens?: number
  maxOutputTokens?: number
  max_output_tokens?: number
  outputTokens?: number
  tokens?: number
}

export interface LlmRuntimeConfig {
  providerOrder: LlmProvider[]
  providers: Partial<Record<LlmProvider, ProviderRuntimeOptions>>
}

let runtimeConfig: LlmRuntimeConfig | null = null

export function setLlmRuntimeConfig(cfg: LlmRuntimeConfig): void {
  runtimeConfig = cfg
}

export function getLlmRuntimeConfig(): LlmRuntimeConfig | null {
  return runtimeConfig
}

export function resolveConfiguredMaxTokens(opt: ProviderRuntimeOptions | undefined): number | null {
  if (!opt) return null
  const candidates = [
    opt.maxTokens,
    opt.max_tokens,
    opt.maxOutputTokens,
    opt.max_output_tokens,
    opt.outputTokens,
    opt.tokens,
  ]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  }
  return null
}
