/**
 * StructuredLlmClientのテスト
 */

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { LlmClient, LlmMessage, LlmResponse } from '../../llm/client.js'
import { StructuredLlmClient, withStructuredOutputs } from '../../llm/structured-client.js'

// テスト用のZodスキーマ
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

// モックLlmClient
const createMockClient = (mockResponse: LlmResponse): LlmClient => ({
  async chat(): Promise<LlmResponse> {
    return mockResponse
  },
})

describe('StructuredLlmClient', () => {
  describe('chatWithSchema', () => {
    it('should return parsed structured response', async () => {
      const mockData = { name: 'Alice', age: 25, email: 'alice@example.com' }
      const mockClient = createMockClient({
        content: JSON.stringify(mockData),
        refusal: null,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      })

      const structuredClient = new StructuredLlmClient(mockClient)
      const messages: LlmMessage[] = [{ role: 'user', content: 'Create a user profile' }]

      const response = await structuredClient.chatWithSchema(messages, UserSchema, 'UserProfile')

      expect(response.parsed).toEqual(mockData)
      expect(response.refusal).toBeNull()
      expect(response.usage?.totalTokens).toBe(30)
    })

    it('should handle refusal response', async () => {
      const mockClient = createMockClient({
        content: '',
        refusal: "I can't help with that request.",
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      })

      const structuredClient = new StructuredLlmClient(mockClient)
      const messages: LlmMessage[] = [{ role: 'user', content: 'Malicious request' }]

      const response = await structuredClient.chatWithSchema(messages, UserSchema, 'UserProfile')

      expect(response.parsed).toBeUndefined()
      expect(response.refusal).toBe("I can't help with that request.")
    })

    it('should handle parsing errors gracefully', async () => {
      const mockClient = createMockClient({
        content: 'invalid json response',
        refusal: null,
      })

      const structuredClient = new StructuredLlmClient(mockClient)
      const messages: LlmMessage[] = [{ role: 'user', content: 'Create a user profile' }]

      const response = await structuredClient.chatWithSchema(messages, UserSchema, 'UserProfile')

      expect(response.parsed).toBeUndefined()
      expect(response.content).toBe('invalid json response')
      expect(response.refusal).toBeNull()
    })

    it('should pass correct options to underlying client', async () => {
      const mockClient = vi.fn().mockResolvedValue({
        content: JSON.stringify({ name: 'Alice', age: 25, email: 'alice@example.com' }),
        refusal: null,
      })

      const client: LlmClient = { chat: mockClient }
      const structuredClient = new StructuredLlmClient(client)
      const messages: LlmMessage[] = [{ role: 'user', content: 'Create a user profile' }]

      await structuredClient.chatWithSchema(messages, UserSchema, 'UserProfile', {
        temperature: 0.7,
        maxTokens: 1000,
      })

      expect(mockClient).toHaveBeenCalledWith(messages, {
        temperature: 0.7,
        maxTokens: 1000,
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'UserProfile',
            strict: true,
            schema: expect.any(Object),
          },
        },
      })
    })
  })

  describe('safeChatWithSchema', () => {
    it('should return success result for valid response', async () => {
      const mockData = { name: 'Alice', age: 25, email: 'alice@example.com' }
      const mockClient = createMockClient({
        content: JSON.stringify(mockData),
        refusal: null,
      })

      const structuredClient = new StructuredLlmClient(mockClient)
      const messages: LlmMessage[] = [{ role: 'user', content: 'Create a user profile' }]

      const result = await structuredClient.safeChatWithSchema(messages, UserSchema, 'UserProfile')

      expect(result.success).toBe(true)
      expect(result.response?.parsed).toEqual(mockData)
      expect(result.error).toBeUndefined()
    })

    it('should return error result for client failures', async () => {
      const mockClient: LlmClient = {
        async chat() {
          throw new Error('Network error')
        },
      }

      const structuredClient = new StructuredLlmClient(mockClient)
      const messages: LlmMessage[] = [{ role: 'user', content: 'Create a user profile' }]

      const result = await structuredClient.safeChatWithSchema(messages, UserSchema, 'UserProfile')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(result.response).toBeUndefined()
    })
  })

  describe('parseResponse', () => {
    it('should parse existing response with schema', () => {
      const mockData = { name: 'Alice', age: 25, email: 'alice@example.com' }
      const response: LlmResponse = {
        content: JSON.stringify(mockData),
        refusal: null,
      }

      const mockClient = createMockClient(response)
      const structuredClient = new StructuredLlmClient(mockClient)

      const parsed = structuredClient.parseResponse(response, UserSchema)

      expect(parsed.parsed).toEqual(mockData)
      expect(parsed.refusal).toBeNull()
    })

    it('should handle refusal in existing response', () => {
      const response: LlmResponse = {
        content: '',
        refusal: 'Cannot process this request',
      }

      const mockClient = createMockClient(response)
      const structuredClient = new StructuredLlmClient(mockClient)

      const parsed = structuredClient.parseResponse(response, UserSchema)

      expect(parsed.parsed).toBeUndefined()
      expect(parsed.refusal).toBe('Cannot process this request')
    })

    it('should handle invalid JSON in existing response', () => {
      const response: LlmResponse = {
        content: 'invalid json',
        refusal: null,
      }

      const mockClient = createMockClient(response)
      const structuredClient = new StructuredLlmClient(mockClient)

      const parsed = structuredClient.parseResponse(response, UserSchema)

      expect(parsed.parsed).toBeUndefined()
      expect(parsed.content).toBe('invalid json')
    })
  })

  describe('raw access', () => {
    it('should provide access to underlying client', () => {
      const mockClient = createMockClient({
        content: 'test',
        refusal: null,
      })

      const structuredClient = new StructuredLlmClient(mockClient)

      expect(structuredClient.raw).toBe(mockClient)
    })
  })

  describe('withStructuredOutputs', () => {
    it('should create StructuredLlmClient wrapper', () => {
      const mockClient = createMockClient({
        content: 'test',
        refusal: null,
      })

      const wrapped = withStructuredOutputs(mockClient)

      expect(wrapped).toBeInstanceOf(StructuredLlmClient)
      expect(wrapped.raw).toBe(mockClient)
    })
  })
})
