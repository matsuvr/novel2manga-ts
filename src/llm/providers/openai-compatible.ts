/**
 * OpenAI互換API用のLLMクライアント（Groq、Grokなど）
 * Structured Outputs対応
 */

import type {
  LlmClient,
  LlmClientOptions,
  LlmEmbeddingResponse,
  LlmMessage,
  LlmResponse,
} from '../client.js'
import {
  InvalidRequestError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  TokenLimitError,
} from '../client.js'

export interface OpenAICompatibleConfig {
  apiKey: string
  baseUrl: string
  model?: string
  timeout?: number
  provider: string // 'groq' | 'grok' | 'cerebras' など
}

interface CompatibleChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CompatibleChatResponse {
  choices: Array<{
    message: {
      content: string | null
      refusal?: string | null
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * OpenAI互換API用のLLMクライアント
 */
export class OpenAICompatibleClient implements LlmClient {
  private config: OpenAICompatibleConfig

  constructor(config: OpenAICompatibleConfig) {
    this.config = config
  }

  get provider(): string {
    return this.config.provider
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    try {
      const model = options.model || this.config.model
      if (!model) {
        throw new InvalidRequestError(
          'Model not specified in options or config',
          this.config.provider,
        )
      }

      const body: Record<string, unknown> = {
        model,
        messages: this.convertMessages(messages),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stream: false,
      }

      // Structured Outputs対応
      if (options.responseFormat) {
        if (options.responseFormat.type === 'json_object') {
          body.response_format = { type: 'json_object' }
        } else if (
          options.responseFormat.type === 'json_schema' &&
          options.responseFormat.json_schema
        ) {
          body.response_format = {
            type: 'json_schema',
            json_schema: {
              name: options.responseFormat.json_schema.name,
              strict: options.responseFormat.json_schema.strict ?? true,
              schema: this.processSchemaForProvider(
                options.responseFormat.json_schema.schema,
                this.config.provider,
              ),
            },
          }
        }
      }

      // ツール対応
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((tool) => ({
          type: tool.type,
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        }))
        body.tool_choice = options.toolChoice
      }

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      })

      if (!response.ok) {
        throw await this.handleHttpError(response)
      }

      const data: CompatibleChatResponse = await response.json()
      const choice = data.choices?.[0]
      if (!choice) {
        throw new ProviderError('No response from provider', this.config.provider)
      }

      const content = choice.message.content || ''
      const refusal = choice.message.refusal || null

      // ツールコールは簡略化（必要に応じて拡張）
      const toolCalls = undefined

      return {
        content,
        toolCalls,
        refusal,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(
          `${this.config.provider} request timed out`,
          options.timeout || this.config.timeout || 60000,
        )
      }
      throw error
    }
  }

  private convertMessages(messages: LlmMessage[]): CompatibleChatMessage[] {
    return messages
      .filter((msg) => msg.role !== 'tool') // ツールメッセージは除外（簡略化）
      .map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      }))
  }

  /**
   * プロバイダー固有のスキーマ処理
   */
  private processSchemaForProvider(
    schema: Record<string, unknown>,
    provider: string,
  ): Record<string, unknown> {
    const processed = { ...schema }

    // Groq固有の制約
    if (provider === 'groq') {
      return this.stripUnsupportedKeywordsForGroq(processed)
    }

    return processed
  }

  /**
   * Groq用の未サポートキーワード除去
   */
  private stripUnsupportedKeywordsForGroq(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const unsupported = new Set([
      'const',
      'format',
      'pattern',
      'contentEncoding',
      'contentMediaType',
    ])

    const stripFromObject = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(stripFromObject)
      }
      if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          if (!unsupported.has(key)) {
            result[key] = stripFromObject(value)
          }
        }
        return result
      }
      return obj
    }

    return stripFromObject(schema) as Record<string, unknown>
  }

  private async handleHttpError(response: Response): Promise<Error> {
    const text = await response.text().catch(() => 'Unknown error')

    switch (response.status) {
      case 429:
        return new RateLimitError(`${this.config.provider} rate limit exceeded: ${text}`)
      case 400:
        if (text.includes('token')) {
          return new TokenLimitError(text, 0, 0)
        }
        return new InvalidRequestError(text, this.config.provider)
      case 408:
        return new TimeoutError(text, this.config.timeout || 60000)
      default:
        return new ProviderError(
          `${this.config.provider} HTTP ${response.status}: ${text}`,
          this.config.provider,
          response.status,
        )
    }
  }

  // 埋め込み機能は未実装（必要に応じて追加）
  async embeddings?(): Promise<LlmEmbeddingResponse> {
    throw new InvalidRequestError(
      `Embeddings not supported by ${this.config.provider}`,
      this.config.provider,
    )
  }
}
