import {
  getLLMDefaultProvider,
  getLLMFallbackChain,
  getLLMProviderConfig,
} from '../../config/llm.config'
import { FakeLlmClient } from '../../llm/fake'
import { defaultBaseUrl, type OpenAICompatProvider } from './base-url'
import { CerebrasClient, type CerebrasClientConfig } from './cerebras'
import { OpenAICompatibleClient } from './openai-compatible'
import type { LlmClient, LlmProvider, OpenAICompatibleConfig } from './types'
import { VertexAIClient, type VertexAIConfig } from './vertexai'

export type ProviderConfig =
  | ({ provider: 'openai' | 'groq' | 'grok' | 'openrouter' | 'gemini' } & Omit<
      OpenAICompatibleConfig,
      'provider'
    >)
  | ({ provider: 'cerebras' } & CerebrasClientConfig)
  | ({ provider: 'vertexai' } & VertexAIConfig)
  | { provider: 'fake' }

export function createLlmClient(cfg: ProviderConfig): LlmClient {
  switch (cfg.provider) {
    case 'openai':
    case 'groq':
    case 'grok':
    case 'openrouter':
    case 'gemini':
      return new OpenAICompatibleClient({ ...cfg, provider: cfg.provider })
    case 'cerebras':
      return new CerebrasClient(cfg)
    case 'vertexai':
      return new VertexAIClient(cfg)
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
  if (provider === 'vertexai') {
    const vertexConfig = cfg.vertexai
    if (!vertexConfig) {
      throw new Error(`Missing Vertex AI configuration for provider: ${provider}`)
    }
    const c: VertexAIConfig = {
      model: cfg.model,
      project: vertexConfig.project,
      location: vertexConfig.location,
      serviceAccountPath: vertexConfig.serviceAccountPath,
    }
    return createLlmClient({ provider: 'vertexai', ...c })
  }

  // OpenAI-compatible providers only
  const oc: Omit<OpenAICompatibleConfig, 'provider'> = {
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl ?? defaultBaseUrl(provider as OpenAICompatProvider),
    // OpenAI gpt-5 系は Responses API を推奨（chat/completions の max_tokens 非対応）
    useChatCompletions: provider !== 'openai' ? true : !/^gpt-5/i.test(cfg.model || ''),
  }
  return createLlmClient({
    provider: provider as OpenAICompatProvider,
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

// defaultBaseUrl は src/agents/llm/base-url.ts に集約
