import {
  getLLMDefaultProvider,
  getLLMFallbackChain,
  getLLMProviderConfig,
} from '../../config/llm.config'
import { FakeLlmClient } from '../../llm/fake'
import { CerebrasClient, type CerebrasClientConfig } from './cerebras'
import { OpenAICompatibleClient } from './openai-compatible'
import type { LlmClient, LlmProvider, OpenAICompatibleConfig } from './types'

export type ProviderConfig =
  | ({ provider: 'openai' | 'groq' | 'openrouter' | 'gemini' } & Omit<
      OpenAICompatibleConfig,
      'provider'
    >)
  | ({ provider: 'cerebras' } & CerebrasClientConfig)
  | { provider: 'fake' }

export function createLlmClient(cfg: ProviderConfig): LlmClient {
  switch (cfg.provider) {
    case 'openai':
    case 'groq':
    case 'openrouter':
    case 'gemini':
      return new OpenAICompatibleClient({ ...cfg, provider: cfg.provider })
    case 'cerebras':
      return new CerebrasClient(cfg)
    case 'fake':
      return new FakeLlmClient()
    default:
      throw new Error(`Unsupported provider: ${(cfg as ProviderConfig).provider}`)
  }
}

// llm.config.ts 由来のランタイム設定を優先し、未設定時のみ環境変数を利用
export function selectProviderOrder(): LlmProvider[] {
  const primary = getLLMDefaultProvider() as LlmProvider
  const chain = getLLMFallbackChain() as LlmProvider[]
  const order = [primary, ...chain]
  // 重複除去
  return order.filter((p, i) => order.indexOf(p) === i)
}

export function createClientForProvider(provider: LlmProvider): LlmClient {
  if (provider === 'fake') {
    return createLlmClient({ provider: 'fake' })
  }

  const cfg = getLLMProviderConfig(provider)
  if (!cfg || typeof cfg.model !== 'string' || !cfg.model) {
    throw new Error(`Missing or invalid model for provider: ${provider}`)
  }
  if (!cfg.apiKey || cfg.apiKey.trim().length === 0) {
    // 設定不足はフォールバック禁止(上位でそのままエラー)
    throw new Error(`Missing API key for provider: ${provider}`)
  }
  if (provider === 'cerebras') {
    const c: CerebrasClientConfig = {
      apiKey: cfg.apiKey,
      model: cfg.model,
    }
    return createLlmClient({ provider: 'cerebras', ...c })
  }
  const oc: Omit<OpenAICompatibleConfig, 'provider'> = {
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl ?? defaultBaseUrl(provider as Exclude<LlmProvider, 'cerebras' | 'fake'>),
    useChatCompletions: true,
  }
  return createLlmClient({
    provider: provider as 'openai' | 'groq' | 'openrouter' | 'gemini',
    ...oc,
  })
}

function _resolveApiKey(apiKeyEnvFromConfig: string | undefined, candidates: string[]): string {
  const names = apiKeyEnvFromConfig ? [apiKeyEnvFromConfig, ...candidates] : candidates
  for (const name of names) {
    const v = process.env[name]
    if (v) return v
  }
  throw new Error(`Missing API key. Tried envs: ${names.join(', ')}`)
}

function _requireConfigured<T>(value: T | undefined, label: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required ${label} in llm.config.ts`)
  }
  return value
}

function defaultBaseUrl(provider: Exclude<LlmProvider, 'cerebras' | 'fake'>): string {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}
