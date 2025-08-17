import type {
  LlmClient,
  LlmClientOptions,
  LlmEmbeddingResponse,
  LlmMessage,
  LlmResponse,
} from './client'
import { ProviderError } from './client'

export interface FakeLlmResponse {
  content: string
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface FakeLlmConfig {
  responses?: FakeLlmResponse[]
  defaultResponse?: FakeLlmResponse
  shouldThrow?: boolean
  errorMessage?: string
  delay?: number
}

export class FakeLlmClient implements LlmClient {
  private config: FakeLlmConfig
  private responseIndex = 0

  constructor(config: FakeLlmConfig = {}) {
    this.config = {
      defaultResponse: {
        content: 'This is a fake response from the test LLM client.',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      },
      ...config,
    }
  }

  async chat(_messages: LlmMessage[], _options: LlmClientOptions = {}): Promise<LlmResponse> {
    if (this.config.shouldThrow) {
      throw new ProviderError(this.config.errorMessage || 'Fake LLM error', 'fake')
    }

    if (this.config.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delay))
    }

    const response = this.getNextResponse()
    return this.normalizeResponse(response)
  }

  async embeddings(
    input: string | string[],
    _options: { model?: string } = {},
  ): Promise<LlmEmbeddingResponse> {
    if (this.config.shouldThrow) {
      throw new ProviderError(this.config.errorMessage || 'Fake LLM error', 'fake')
    }

    if (this.config.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delay))
    }

    const inputs = Array.isArray(input) ? input : [input]
    const embeddings = inputs.map((_, index) => ({
      embedding: Array.from({ length: 1536 }, () => Math.random()),
      index,
    }))

    return {
      embeddings,
      usage: {
        promptTokens: inputs.reduce((sum, text) => sum + text.length, 0),
        totalTokens: inputs.reduce((sum, text) => sum + text.length, 0),
      },
    }
  }

  private getNextResponse(): FakeLlmResponse {
    if (this.config.responses && this.config.responses.length > 0) {
      const response = this.config.responses[this.responseIndex % this.config.responses.length]
      this.responseIndex++
      return response
    }

    if (!this.config.defaultResponse) {
      throw new Error('No default response configured')
    }
    return this.config.defaultResponse
  }

  private normalizeResponse(response: FakeLlmResponse): LlmResponse {
    return {
      content: response.content,
      toolCalls: response.toolCalls,
      usage: response.usage,
    }
  }

  // テスト用のヘルパーメソッド
  reset(): void {
    this.responseIndex = 0
  }

  setResponses(responses: FakeLlmResponse[]): void {
    this.config.responses = responses
    this.reset()
  }

  setShouldThrow(shouldThrow: boolean, errorMessage?: string): void {
    this.config.shouldThrow = shouldThrow
    this.config.errorMessage = errorMessage
  }

  setDelay(delay: number): void {
    this.config.delay = delay
  }
}

// テスト用のファクトリーヘルパー
export function createFakeLlmClient(config?: FakeLlmConfig): FakeLlmClient {
  return new FakeLlmClient(config)
}

// 一般的なテストレスポンスのプリセット
export const fakeResponses = {
  simple: {
    content: 'This is a simple test response.',
    usage: {
      promptTokens: 5,
      completionTokens: 10,
      totalTokens: 15,
    },
  },
  withToolCall: {
    content: 'I will call a tool to help you.',
    toolCalls: [
      {
        id: 'call_123',
        type: 'function' as const,
        function: {
          name: 'test_tool',
          arguments: '{"param": "value"}',
        },
      },
    ],
    usage: {
      promptTokens: 10,
      completionTokens: 15,
      totalTokens: 25,
    },
  },
  error: {
    content: '',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  },
}
