import {
  getLLMDefaultProvider,
  getLLMFallbackChain,
  getLLMProviderConfig,
} from '../../config/llm.config'
import { FakeLlmClient } from '../../llm/fake'
import { defaultBaseUrl, type OpenAICompatProvider } from './base-url'
import { OpenAICompatibleClient } from './openai-compatible'
import type { LlmClient, LlmProvider, OpenAICompatibleConfig } from './types'
import { VertexAIClient, type VertexAIClientConfig } from './vertexai'

export type ProviderConfig =
  | ({ provider: 'openai' | 'groq' | 'grok' | 'openrouter' } & Omit<
      OpenAICompatibleConfig,
      'provider'
    >)

  | VertexAIClientConfig
  | { provider: 'fake' }

export function createLlmClient(cfg: ProviderConfig): LlmClient {
  switch (cfg.provider) {
    case 'openai':
    case 'groq':
    case 'grok':
    case 'openrouter':
      // TODO: 新しいログシステムとの統合は後で実装
      return new OpenAICompatibleClient({ ...cfg, provider: cfg.provider })
    case 'gemini':
      // TODO: 新しいログシステムとの統合は後で実装
      return new VertexAIClient(cfg)
    case 'vertexai':
      // TODO: 新しいログシステムとの統合は後で実装
      return new VertexAIClient(cfg)
    case 'fake':
      // TODO: 新しいログシステムとの統合は後で実装
      return new FakeLlmClient() as unknown as LlmClient
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

  if (provider === 'vertexai' || provider === 'gemini') {
    const vertexConfig = cfg.vertexai
    if (!vertexConfig) {
      throw new Error(`Missing Vertex AI configuration for provider: ${provider}`)
    }
    const c: VertexAIClientConfig = {
      provider,
      model: cfg.model,
      project: _requireConfigured(vertexConfig.project, 'vertexai.project'),
      location: _requireConfigured(vertexConfig.location, 'vertexai.location'),
      serviceAccountPath: vertexConfig.serviceAccountPath,
    }
    return createLlmClient(c)
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
