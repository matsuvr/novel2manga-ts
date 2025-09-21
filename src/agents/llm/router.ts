import { getLLMDefaultProvider, getLLMFallbackChain, getLLMProviderConfig } from '../../config/llm.config'
import { defaultBaseUrl, type OpenAICompatProvider } from './base-url'
import { FakeLlmClient } from './fake'
import { OpenAICompatibleClient } from './openai-compatible'
import type { LlmClient, LlmProvider, OpenAICompatibleConfig } from './types'
import { VertexAIClient, type VertexAIConfig } from './vertexai'

export type ProviderConfig =
  | ({ provider: 'openai' | 'groq' | 'grok' | 'openrouter' } & OpenAICompatibleConfig)
  | ({ provider: 'gemini' | 'vertexai' } & VertexAIConfig)
  | { provider: 'fake' }

export function createLlmClient(cfg: ProviderConfig): LlmClient {
  if (cfg.provider === 'fake') return new FakeLlmClient()
  if (cfg.provider === 'gemini' || cfg.provider === 'vertexai') {
    return new VertexAIClient(cfg)
  }
  // OpenAI 互換
  return new OpenAICompatibleClient(cfg as Extract<ProviderConfig, { provider: 'openai' | 'groq' | 'grok' | 'openrouter' }>)
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
  if (provider === 'fake') return createLlmClient({ provider: 'fake' })

  const cfg = getLLMProviderConfig(provider)
  if (!cfg || typeof cfg.model !== 'string' || !cfg.model) {
    throw new Error(`Missing or invalid model for provider: ${provider}`)
  }

  if (provider === 'vertexai' || provider === 'gemini') {
    const vertexConfig = cfg.vertexai
    if (!vertexConfig) throw new Error(`Missing Vertex AI configuration for provider: ${provider}`)
    const c: ProviderConfig = {
      provider,
      model: cfg.model,
      project: _requireConfigured(vertexConfig.project, 'vertexai.project'),
      location: _requireConfigured(vertexConfig.location, 'vertexai.location'),
      serviceAccountPath: vertexConfig.serviceAccountPath,
    }
    return createLlmClient(c)
  }

  if (!cfg.apiKey || cfg.apiKey.trim().length === 0) {
    throw new Error(`Missing API key for provider: ${provider}`)
  }
  const oc: OpenAICompatibleConfig = {
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl ?? defaultBaseUrl(provider as OpenAICompatProvider),
    provider: provider as OpenAICompatProvider,
  }
  return new OpenAICompatibleClient(oc)
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

// defaultBaseUrl は src/agents/llm/base-url.ts に集約
