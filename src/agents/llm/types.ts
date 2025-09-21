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
}

export interface OpenAICompatibleConfig {
  baseUrl?: string
  apiKey: string
  model: string
  provider: Extract<LlmProvider, 'openai' | 'groq' | 'grok' | 'openrouter'>
  useChatCompletions?: boolean
}

// Cerebras provider removed

