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

      const response = await this.client.chat.completions.create({
        ...params,
        stream: false,
      })

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
    if (error instanceof Error) {
      // OpenAI SDKのエラーを適切な型に変換
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
            return new ProviderError(error.message, 'openai', status, requestId, error)
        }
      }
    }

    return new ProviderError(
      error instanceof Error ? error.message : 'Unknown OpenAI error',
      'openai',
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    )
  }
}
