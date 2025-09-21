import type { z } from 'zod'

export type LlmProvider =
  | 'openai'
  | 'groq'
  | 'grok'
  | 'openrouter'
  | 'gemini'
  | 'vertexai'
  | 'fake'

export interface StructuredOutputSpec<T> {
  schema: z.ZodType<T>
  schemaName: string
  description?: string
}

export interface StructuredGenOptions {
  maxTokens: number
  stop?: string[]
  seed?: number
}

export interface LlmTelemetryContext {
  jobId?: string
  agentName?: string
  stepName?: string
  chunkIndex?: number
  episodeNumber?: number
  retryAttempt?: number
  cacheHit?: boolean
}

export interface GenerateStructuredParams<T> {
  systemPrompt?: string
  userPrompt: string
  spec: StructuredOutputSpec<T>
  options: StructuredGenOptions
  telemetry?: LlmTelemetryContext
}

export interface LlmClient {
  readonly provider: LlmProvider
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>
  /**
   * （レガシー互換 / ツール呼び出しポリシー用）通常のチャット補完。
   * 新実装では主に構造化出力(generateStructured)を推奨するため任意。
   */
  chat?(messages: LlmMessage[], options?: ChatOptions): Promise<LlmResponse>
}

// ---- Chat 補完互換用 型定義（ReAct / SingleTurn ポリシーが依存） ----
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  toolCallId?: string
}

export interface LlmTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface LlmResponse {
  content: string
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  usage?: LlmUsage
}

export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  tools?: LlmTool[]
  responseFormat?: {
    type: 'json_object' | 'json_schema'
    json_schema?: { name: string; strict?: boolean; schema: Record<string, unknown> }
  }
  timeout?: number
  telemetry?: LlmTelemetryContext
}

export interface OpenAICompatibleConfig {
  baseUrl?: string
  apiKey: string
  model: string
  provider: Extract<LlmProvider, 'openai' | 'groq' | 'grok' | 'openrouter'>
  useChatCompletions?: boolean
}

// Cerebras provider removed
