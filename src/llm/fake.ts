import type { GenerateStructuredParams, LlmProvider } from '@/agents/llm/types'
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
  readonly provider: LlmProvider = 'fake'
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

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    spec,
    options: _options,
  }: GenerateStructuredParams<T>): Promise<T> {
    if (this.config.shouldThrow) {
      throw new ProviderError(
        this.config.errorMessage || 'Fake LLM generateStructured error',
        'fake',
      )
    }

    if (this.config.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delay))
    }

    // テスト用の構造化レスポンス生成
    return this.generateTestStructuredResponse(
      spec.schemaName,
      systemPrompt,
      userPrompt,
      spec.schema,
    )
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

  // 構造化レスポンス生成のヘルパーメソッド
  private generateTestStructuredResponse<T>(
    schemaName: string,
    _systemPrompt?: string,
    _userPrompt?: string,
    schema?: unknown,
  ): T {
    // schemaNameに基づいてテスト用の適切なレスポンスを生成
    switch (schemaName) {
      case 'Script':
        return {
          title: 'Test Script',
          scenes: [
            {
              id: 'scene-1',
              location: 'テスト場所',
              time: '昼',
              description: 'テスト用シーン',
              script: [
                { index: 1, type: 'narration', text: 'テストナレーション', speaker: null },
                { index: 2, type: 'dialogue', text: 'テストセリフ', speaker: 'テストキャラ' },
              ],
            },
          ],
        } as T
      case 'PageBreakPlan':
        return {
          pages: [
            {
              pageNumber: 1,
              panelCount: 2,
              panels: [
                {
                  panelIndex: 1,
                  content: 'テストパネル1',
                  dialogue: [{ speaker: 'テストキャラ', lines: 'テストセリフ1' }],
                },
                {
                  panelIndex: 2,
                  content: 'テストパネル2',
                  dialogue: [{ speaker: 'テストキャラ', lines: 'テストセリフ2' }],
                },
              ],
            },
          ],
        } as T
      case 'PanelAssignmentPlan':
        return {
          pages: [
            {
              pageNumber: 1,
              panelCount: 2,
              panels: [
                { panelIndex: 1, lines: [1, 2] },
                { panelIndex: 2, lines: [3, 4] },
              ],
            },
          ],
        } as T
      default: {
        // 汎用的なテストオブジェクト
        const testObj = {
          message: 'test response',
          success: true,
          data: { test: true },
        }

        // schemaが提供されている場合は、そのスキーマに合わせようとする
        if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
          try {
            return (schema as { parse: (obj: unknown) => T }).parse(testObj)
          } catch {
            // パースに失敗した場合は空のオブジェクトを返す
            return {} as T
          }
        }

        return testObj as T
      }
    }
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
