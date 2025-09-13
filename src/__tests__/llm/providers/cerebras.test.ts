import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmClientOptions, LlmMessage } from '../../../llm/client'
import {
  InvalidRequestError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  TokenLimitError,
} from '../../../llm/client'
import { CerebrasClient } from '../../../llm/providers/cerebras'

// Mock the Cerebras SDK
const mockCreate = vi.fn()
vi.mock('@cerebras/cerebras_cloud_sdk', () => {
  class MockCerebras {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
  }
  return {
    default: MockCerebras,
  }
})

// Mock the cerebras-utils module
vi.mock('../../../llm/providers/cerebras-utils', () => ({
  createCerebrasResponseFormat: vi.fn().mockReturnValue({
    type: 'json_schema',
    json_schema: {
      name: 'test_schema',
      strict: true,
      schema: { type: 'object', additionalProperties: false },
    },
  }),
}))

describe('CerebrasClient', () => {
  let client: CerebrasClient

  beforeEach(() => {
    vi.clearAllMocks()

    const config = {
      apiKey: 'test-api-key',
      model: 'llama-4-scout-17b-16e-instruct',
      baseUrl: 'https://api.cerebras.ai/v1',
      timeout: 30000,
    }

    client = new CerebrasClient(config)
  })

  describe('chat', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, world!' },
    ]

    it('should successfully make a chat completion request', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello! How can I help you today?',
            },
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      }

      mockCreate.mockResolvedValue(mockResponse)

      const options: LlmClientOptions = {
        model: 'llama-4-scout-17b-16e-instruct',
        maxTokens: 100,
        temperature: 0.7,
        topP: 0.9,
      }

      const result = await client.chat(messages, options)

      expect(result).toEqual({
        content: 'Hello! How can I help you today?',
        toolCalls: undefined,
        usage: {
          promptTokens: 15,
          completionTokens: 8,
          totalTokens: 23,
        },
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_completion_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
      })
    })

    it('should filter out tool messages', async () => {
      const messagesWithTool: LlmMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'tool', content: 'Tool response' },
        { role: 'assistant', content: 'Response' },
      ]

      const mockResponse = {
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }

      mockCreate.mockResolvedValue(mockResponse)

      await client.chat(messagesWithTool)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Response' },
          ],
        }),
      )
    })

    it('should handle structured outputs with JSON schema', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"result": "success"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }

      mockCreate.mockResolvedValue(mockResponse)

      const options: LlmClientOptions = {
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'test_schema',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                result: { type: 'string' },
              },
              required: ['result'],
              additionalProperties: false,
            },
          },
        },
      }

      const result = await client.chat(messages, options)

      expect(result.content).toBe('{"result": "success"}')

      // Verify that createCerebrasResponseFormat was called
      const { createCerebrasResponseFormat } = await import('../../../llm/providers/cerebras-utils')
      expect(createCerebrasResponseFormat).toHaveBeenCalledWith(
        'json_schema',
        options.responseFormat!.json_schema,
      )

      // Verify the API call included response_format
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'test_schema',
              strict: true,
              schema: { type: 'object', additionalProperties: false },
            },
          },
        }),
      )
    })

    it('should handle JSON object response format', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"data": "value"}' } }],
      }

      mockCreate.mockResolvedValue(mockResponse)

      const options: LlmClientOptions = {
        responseFormat: {
          type: 'json_object',
        },
      }

      await client.chat(messages, options)

      const { createCerebrasResponseFormat } = await import('../../../llm/providers/cerebras-utils')
      expect(createCerebrasResponseFormat).toHaveBeenCalledWith('json_object', undefined)
    })

    it('should throw InvalidRequestError when model is not specified', async () => {
      const clientWithoutModel = new CerebrasClient({
        apiKey: 'test-key',
      })

      await expect(clientWithoutModel.chat(messages)).rejects.toThrow(
        'Model not specified in options or config',
      )
    })

    it('should throw ProviderError when no choices are returned', async () => {
      mockCreate.mockResolvedValue({ choices: [] })

      await expect(client.chat(messages)).rejects.toThrow(ProviderError)
    })

    it('should handle rate limit errors', async () => {
      const error = new Error('Rate limit exceeded')
      ;(error as any).status = 429
      ;(error as any).requestId = 'req-123'

      mockCreate.mockRejectedValue(error)

      await expect(client.chat(messages)).rejects.toThrow(RateLimitError)
    })

    it('should handle token limit errors', async () => {
      const error = new Error('Token limit exceeded - token')
      ;(error as any).status = 400

      mockCreate.mockRejectedValue(error)

      await expect(client.chat(messages)).rejects.toThrow(TokenLimitError)
    })

    it('should handle timeout errors', async () => {
      const error = new Error('Request timeout')
      ;(error as any).status = 408

      mockCreate.mockRejectedValue(error)

      await expect(client.chat(messages)).rejects.toThrow(TimeoutError)
    })

    it('should handle generic provider errors', async () => {
      const error = new Error('Internal server error')
      ;(error as any).status = 500

      mockCreate.mockRejectedValue(error)

      await expect(client.chat(messages)).rejects.toThrow(ProviderError)
    })

    it('should handle unknown errors', async () => {
      const error = new Error('Unknown error')

      mockCreate.mockRejectedValue(error)

      await expect(client.chat(messages)).rejects.toThrow(ProviderError)
    })
  })

  describe('embeddings', () => {
    it('should throw error as embeddings are not supported', async () => {
      await expect(client.embeddings('test input')).rejects.toThrow(
        'Embeddings are not supported by Cerebras provider',
      )
    })
  })
})
