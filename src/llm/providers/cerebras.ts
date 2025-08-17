import Cerebras from '@cerebras/cerebras_cloud_sdk'
import type {
  LlmClient,
  LlmClientOptions,
  LlmEmbeddingResponse,
  LlmMessage,
  LlmResponse,
} from '../client'
import {
  InvalidRequestError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  TokenLimitError,
} from '../client'

export interface CerebrasConfig {
  apiKey: string
  model?: string
  baseUrl?: string
  timeout?: number
}

export class CerebrasClient implements LlmClient {
  private client: Cerebras
  private config: CerebrasConfig

  constructor(config: CerebrasConfig) {
    this.config = config
    this.client = new Cerebras({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    try {
      const model = options.model || this.config.model
      if (!model) {
        throw new InvalidRequestError('Model not specified in options or config', 'cerebras')
      }

      // Base parameters for Cerebras API
      const baseParams = {
        model,
        messages: messages
          .filter((msg) => msg.role !== 'tool') // Cerebrasはtoolロールをサポートしていない
          .map((msg) => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
        max_completion_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
      }

      // Add response_format if specified and create completion
      let completion: Awaited<ReturnType<typeof this.client.chat.completions.create>>
      if (options.responseFormat) {
        const { createCerebrasResponseFormat } = await import('./cerebras-utils')
        const responseFormat = createCerebrasResponseFormat(
          options.responseFormat.type,
          options.responseFormat.json_schema,
        )

        if (responseFormat.type === 'json_object') {
          completion = await this.client.chat.completions.create({
            ...baseParams,
            response_format: { type: 'json_object' },
          })
        } else {
          completion = await this.client.chat.completions.create({
            ...baseParams,
            response_format: {
              type: 'json_schema',
              json_schema: responseFormat.json_schema,
            },
          })
        }
      } else {
        completion = await this.client.chat.completions.create(baseParams)
      }

      const response = completion as unknown as {
        choices: Array<{ message: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      }

      const choice = response.choices[0]
      if (!choice) {
        throw new ProviderError('No response from Cerebras', 'cerebras')
      }

      const content = choice.message.content || ''

      return {
        content,
        toolCalls: undefined, // Cerebrasは現在ツールコールをサポートしていない
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens || 0,
              completionTokens: response.usage.completion_tokens || 0,
              totalTokens: response.usage.total_tokens || 0,
            }
          : undefined,
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async embeddings(
    _input: string | string[],
    _options: { model?: string } = {},
  ): Promise<LlmEmbeddingResponse> {
    throw new Error('Embeddings are not supported by Cerebras provider')
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      // Cerebras SDKのエラーを適切な型に変換
      if ('status' in error) {
        const status = (error as { status?: number }).status
        const requestId = (error as { requestId?: string }).requestId

        switch (status) {
          case 429:
            return new RateLimitError(error.message, undefined, requestId, error)
          case 400:
            if (error.message.includes('token')) {
              return new TokenLimitError(
                error.message,
                0, // maxTokensは後で設定
                0, // requestedTokensは後で設定
                requestId,
                error,
              )
            }
            return new InvalidRequestError(error.message, undefined, requestId, error)
          case 408:
            return new TimeoutError(error.message, this.config.timeout || 60000, requestId, error)
          default:
            return new ProviderError(error.message, 'cerebras', status, requestId, error)
        }
      }
    }

    return new ProviderError(
      error instanceof Error ? error.message : 'Unknown Cerebras error',
      'cerebras',
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    )
  }
}
