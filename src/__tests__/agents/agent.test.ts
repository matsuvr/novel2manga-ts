import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Agent } from '@/agents/agent'
import { AgentError, AgentErrorType } from '@/agents/errors'

// Mock LLM Provider Configuration
vi.mock('@/config', () => ({
  getLLMProviderConfig: vi.fn().mockImplementation((provider: string) => ({
    apiKey: `test-${provider}-key`,
    model: provider === 'openai' ? 'gpt-4' : provider === 'cerebras' ? 'llama3.1-8b' : 'gemini-pro',
    maxTokens: 1000,
    baseUrl: provider === 'cerebras' ? 'https://api.cerebras.ai/v1' : undefined,
  })),
}))

// Mock OpenAI SDK
const mockOpenAICreate = vi.fn()
vi.mock('openai', () => {
  const MockOpenAI = class {
    chat = {
      completions: {
        create: mockOpenAICreate,
      },
    }
  }
  return {
    default: MockOpenAI,
  }
})

// Mock Cerebras SDK
const mockCerebrasCreate = vi.fn()
vi.mock('@cerebras/cerebras_cloud_sdk', () => {
  const MockCerebras = class {
    chat = {
      completions: {
        create: mockCerebrasCreate,
      },
    }
  }
  return {
    default: MockCerebras,
  }
})

// Mock Google GenAI SDK
const mockGenerateContent = vi.fn()
vi.mock('@google/genai', () => {
  const MockGoogleGenAI = class {
    models = {
      generateContent: mockGenerateContent,
    }
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
  }
})

// Mock fetch for Cerebras (fallback)
global.fetch = vi.fn()

describe('Agent', () => {
  let agent: Agent

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock
    ;(global.fetch as any)?.mockReset?.()
    // Reset SDK mocks
    mockOpenAICreate.mockReset()
    mockCerebrasCreate.mockReset()
    mockGenerateContent.mockReset()
    
    agent = new Agent({
      name: 'test-agent',
      instructions: 'Test instructions',
      provider: 'openai',
      model: 'gpt-4',
      maxTokens: 1000,
    })
  })

  describe('Cerebras Integration', () => {
    beforeEach(() => {
      agent = new Agent({
        name: 'test-agent',
        instructions: 'Test instructions',
        provider: 'cerebras',
        model: 'llama3.1-8b',
        maxTokens: 1000,
      })
    })

    it('should handle successful Cerebras API response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '{"test": "value"}',
            },
          },
        ],
      }
      mockCerebrasCreate.mockResolvedValue(mockResponse)

      const schema = z.object({ test: z.string() })
      const result = await agent.generateObject([{ role: 'user', content: 'test' }], schema)

      expect(result).toEqual({ test: 'value' })
      expect(mockCerebrasCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'llama3.1-8b',
        messages: expect.arrayContaining([
          { role: 'system', content: 'Test instructions' },
          { role: 'user', content: 'test' },
        ]),
        response_format: expect.objectContaining({
          type: 'json_schema',
        }),
      }))
    })

    it('should handle Cerebras JSON parse errors correctly without retries', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'invalid json content',
            },
          },
        ],
      }
      mockCerebrasCreate.mockResolvedValue(mockResponse)

      const schema = z.object({ test: z.string() })
      const promise = agent.generateObject(
        [{ role: 'user', content: 'test' }],
        schema,
        { maxRetries: 0 },
      )

      const error = await expect(promise).rejects.toBeInstanceOf(AgentError)
      expect(error.provider).toBe('cerebras')
      expect(error.type).toBe(AgentErrorType.JSON_PARSE_ERROR)
    })

    it('should handle Cerebras schema validation errors without retries', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '{"wrong": "field"}',
            },
          },
        ],
      }
      mockCerebrasCreate.mockResolvedValue(mockResponse)

      const schema = z.object({ test: z.string() })
      const promise = agent.generateObject(
        [{ role: 'user', content: 'test' }],
        schema,
        { maxRetries: 0 },
      )

      const error = await expect(promise).rejects.toBeInstanceOf(AgentError)
      expect(error.provider).toBe('cerebras')
      expect(error.type).toBe(AgentErrorType.SCHEMA_VALIDATION_ERROR)
    })

    it('should handle Cerebras API errors without retries', async () => {
      const apiError = new Error('API rate limit exceeded')
      mockCerebrasCreate.mockRejectedValue(apiError)

      const schema = z.object({ test: z.string() })
      const promise = agent.generateObject(
        [{ role: 'user', content: 'test' }],
        schema,
        { maxRetries: 0 },
      )

      const error = await expect(promise).rejects.toBeInstanceOf(AgentError)
      expect(error.provider).toBe('cerebras')
      expect(error.type).toBe(AgentErrorType.PROVIDER_ERROR)
    })

    it('should handle network errors for Cerebras without retries', async () => {
      const networkError = new Error('Network error')
      mockCerebrasCreate.mockRejectedValue(networkError)

      const schema = z.object({ test: z.string() })
      const promise = agent.generateObject(
        [{ role: 'user', content: 'test' }],
        schema,
        { maxRetries: 0 },
      )

      const error = await expect(promise).rejects.toBeInstanceOf(AgentError)
      expect(error.provider).toBe('cerebras')
      expect(error.type).toBe(AgentErrorType.PROVIDER_ERROR)
    })
  })

  describe('Provider Initialization', () => {
    it('should initialize with OpenAI provider successfully', () => {
      expect(agent).toBeDefined()
      expect(() => agent).not.toThrow()
    })

    it('should handle provider switching', () => {
      const geminiAgent = new Agent({
        name: 'test-agent',
        instructions: 'Test instructions',
        provider: 'gemini',
        model: 'gemini-pro',
        maxTokens: 1000,
      })

      expect(geminiAgent).toBeDefined()
    })

    it('should handle unsupported provider gracefully', () => {
      expect(() => {
        new Agent({
          name: 'test-agent',
          instructions: 'Test instructions',
          provider: 'invalid-provider' as any,
          model: 'test-model',
          maxTokens: 1000,
        })
      }).toThrow('Unknown provider: invalid-provider')
    })
  })

  describe('Error Handling', () => {
    it('should preserve AgentError instances when rethrowing', async () => {
      const originalError = new AgentError(
        AgentErrorType.API_ERROR,
        'Test error',
        'openai',
        new Error('Original error')
      )
      
      mockOpenAICreate.mockRejectedValue(originalError)

      const schema = z.object({ test: z.string() })
      
      try {
        await agent.generateObject([{ role: 'user', content: 'test' }], schema, {
          maxRetries: 0,
        })
      } catch (error) {
        expect(error).toBe(originalError)
        expect(error).toBeInstanceOf(AgentError)
      }
    })

    it('should wrap unknown errors in AgentError', async () => {
      const unknownError = new Error('Unknown error')
      mockOpenAICreate.mockRejectedValue(unknownError)

      const schema = z.object({ test: z.string() })
      
      try {
        await agent.generateObject([{ role: 'user', content: 'test' }], schema, {
          maxRetries: 0,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError)
        expect((error as AgentError).provider).toBe('openai')
        expect((error as AgentError).originalError).toBe(unknownError)
      }
    })
  })
})