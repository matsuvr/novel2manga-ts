import OpenAI from 'openai'
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
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

export interface OpenAIConfig {
  apiKey: string
  model?: string
  baseUrl?: string
  timeout?: number
}

function convertLlmMessagesToOpenAI(messages: LlmMessage[]): ChatCompletionMessageParam[] {
  return messages.map((msg): ChatCompletionMessageParam => {
    switch (msg.role) {
      case 'system':
        return {
          role: 'system',
          content: msg.content,
        }
      case 'user':
        return {
          role: 'user',
          content: msg.content,
        }
      case 'assistant':
        return {
          role: 'assistant',
          content: msg.content,
        }
      case 'tool':
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId || '',
        }
      default:
        throw new Error(`Unsupported message role: ${msg.role}`)
    }
  })
}

export class OpenAIClient implements LlmClient {
  private client: OpenAI
  private config: OpenAIConfig

  constructor(config: OpenAIConfig) {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout,
    })
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    try {
      const model = options.model || this.config.model
      if (!model) {
        throw new InvalidRequestError('Model not specified in options or config', 'openai')
      }

      const params: ChatCompletionCreateParams = {
        model,
        messages: convertLlmMessagesToOpenAI(messages),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stream: false,
      }

      // ツールの設定
      if (options.tools && options.tools.length > 0) {
        params.tools = options.tools.map((tool) => ({
          type: tool.type,
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        }))
        params.tool_choice = options.toolChoice
      }

      // Structured output (JSON) support
      if (options.responseFormat) {
        // OpenAI supports response_format: json_object | json_schema
        if (options.responseFormat.type === 'json_object') {
          ;(
            params as ChatCompletionCreateParams & { response_format?: { type: 'json_object' } }
          ).response_format = {
            type: 'json_object',
          }
        } else if (
          options.responseFormat.type === 'json_schema' &&
          options.responseFormat.json_schema
        ) {
          ;(
            params as ChatCompletionCreateParams & {
              response_format?: {
                type: 'json_schema'
                json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> }
              }
            }
          ).response_format = {
            type: 'json_schema',
            json_schema: options.responseFormat.json_schema,
          }
        }
      }

      // タイムアウト設定
      const requestTimeout = options.timeout ?? this.config.timeout

      let response: Awaited<ReturnType<typeof this.client.chat.completions.create>>
      try {
        response = await this.client.chat.completions.create(
          {
            ...params,
            stream: false,
          },
          {
            timeout: requestTimeout, // リクエストごとのタイムアウトを設定
          },
        )
      } catch (err) {
        // If model rejects max_tokens (new Responses-API-only models), retry via Responses API
        const msg = err instanceof Error ? err.message : String(err)
        if (
          msg.includes("Unsupported parameter: 'max_tokens'") ||
          msg.includes('Use "max_completion_tokens"')
        ) {
          const resp = await this.chatViaResponses(messages, options, model)
          return resp
        }
        throw err
      }

      const choice = response.choices[0]
      if (!choice) {
        throw new ProviderError('No response from OpenAI', 'openai')
      }

      const content = choice.message.content || ''
      const toolCalls = choice.message.tool_calls?.map((call) => {
        if (call.type === 'function' && 'function' in call) {
          return {
            id: call.id,
            type: call.type as 'function',
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          }
        }
        // Handle other tool call types if needed
        return {
          id: call.id,
          type: call.type as 'function',
          function: {
            name: 'unknown',
            arguments: '{}',
          },
        }
      })

      return {
        content,
        toolCalls,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  private async chatViaResponses(
    messages: LlmMessage[],
    options: LlmClientOptions,
    model: string,
  ): Promise<LlmResponse> {
    try {
      // Build Responses API input
      const input = messages.map((m) => ({
        role: m.role,
        content: [
          {
            type: 'text' as const,
            text: m.content,
          },
        ],
      }))

      const payload: Record<string, unknown> = {
        model,
        input,
        max_output_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
      }

      if (options.responseFormat) {
        payload.response_format = options.responseFormat
      }

      const r = (await this.client.responses.create(payload)) as unknown as {
        output_text?: string
        output?: Array<{ content?: Array<{ type: string; text?: string }> }>
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
      }

      const content = r.output_text || r.output?.[0]?.content?.[0]?.text || ''

      return {
        content,
        usage: r.usage
          ? {
              promptTokens: r.usage.input_tokens || 0,
              completionTokens: r.usage.output_tokens || 0,
              totalTokens: r.usage.total_tokens || 0,
            }
          : undefined,
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async embeddings(
    input: string | string[],
    options: { model?: string } = {},
  ): Promise<LlmEmbeddingResponse> {
    try {
      const model = options.model || this.config.model
      if (!model) {
        throw new InvalidRequestError('Model not specified in options or config', 'openai')
      }

      const response = await this.client.embeddings.create({
        model,
        input,
      })

      return {
        embeddings: response.data.map((embedding) => ({
          embedding: embedding.embedding,
          index: embedding.index,
        })),
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      const requestId = error.requestID ?? undefined
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        return new TimeoutError(error.message, this.config.timeout ?? 60000, requestId, error)
      }
      switch (error.status) {
        case 429:
          return new RateLimitError(error.message, undefined, requestId, error)
        case 400:
          if (error.message.includes('token')) {
            return new TokenLimitError(error.message, 0, 0, requestId, error)
          }
          return new InvalidRequestError(error.message, undefined, requestId, error)
        case 408: // Should be caught by ETIMEDOUT, but as a fallback
          return new TimeoutError(error.message, this.config.timeout || 60000, requestId, error)
        default:
          return new ProviderError(error.message, 'openai', error.status, requestId, error)
      }
    }
    if (error instanceof Error) {
      // Handle non-API errors from the SDK
      return new ProviderError(error.message, 'openai', undefined, undefined, error)
    }

    return new ProviderError(
      'Unknown OpenAI error',
      'openai',
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    )
  }
}
