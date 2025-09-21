import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { AgentError, AgentErrorType } from '@/agents/errors'

describe('AgentError', () => {
  describe('constructor', () => {
    it('should create AgentError with all properties', () => {
      const originalError = new Error('Original error')
      const agentError = new AgentError(
        AgentErrorType.API_ERROR,
        'Test error message',
        'openai',
        originalError,
      )

      expect(agentError.message).toBe('Test error message')
      expect(agentError.type).toBe(AgentErrorType.API_ERROR)
      expect(agentError.provider).toBe('openai')
      expect(agentError.originalError).toBe(originalError)
      expect(agentError.name).toBe('AgentError')
      expect(agentError).toBeInstanceOf(Error)
    })

    it('should create AgentError without original error', () => {
      const agentError = new AgentError(
        AgentErrorType.NETWORK_ERROR,
        'Test error message',
        'gemini',
      )

      expect(agentError.message).toBe('Test error message')
      expect(agentError.type).toBe(AgentErrorType.NETWORK_ERROR)
      expect(agentError.provider).toBe('gemini')
      expect(agentError.originalError).toBeUndefined()
    })
  })

  describe('static factory methods', () => {
    it('should create AgentError from JSON parse error', () => {
      const jsonError = new SyntaxError('Unexpected token in JSON at position 0')
      const agentError = AgentError.fromJsonParseError(jsonError, 'openai')

      expect(agentError.message).toContain('Failed to parse JSON response')
      expect(agentError.type).toBe(AgentErrorType.JSON_PARSE_ERROR)
      expect(agentError.provider).toBe('openai')
      expect(agentError.originalError).toBe(jsonError)
    })

    it('should create AgentError from schema validation error', () => {
      const zodError = new ZodError([
        {
          path: ['test'],
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          message: 'Expected string, received number',
        },
      ])
      const agentError = AgentError.fromSchemaValidationError(zodError, 'openai')

      expect(agentError.message).toContain('Schema validation failed')
      expect(agentError.type).toBe(AgentErrorType.SCHEMA_VALIDATION_ERROR)
      expect(agentError.provider).toBe('openai')
      expect(agentError.originalError).toBe(zodError)
    })

    it('should create AgentError from provider error', () => {
      const providerError = new Error('Provider specific error')
      const agentError = AgentError.fromProviderError(providerError, 'gemini')

      expect(agentError.message).toContain('Provider error')
      expect(agentError.type).toBe(AgentErrorType.PROVIDER_ERROR)
      expect(agentError.provider).toBe('gemini')
      expect(agentError.originalError).toBe(providerError)
    })
  })

  describe('error categorization', () => {
    it('should handle different error types correctly', () => {
      const errorTypes = [
        AgentErrorType.JSON_PARSE_ERROR,
        AgentErrorType.SCHEMA_VALIDATION_ERROR,
        AgentErrorType.API_ERROR,
        AgentErrorType.NETWORK_ERROR,
        AgentErrorType.PROVIDER_ERROR,
      ] as const

      errorTypes.forEach((type) => {
        const error = new AgentError(type, 'Test message', 'openai')
        expect(error.type).toBe(type)
      })
    })

    it('should handle different providers correctly', () => {
      const providers = ['openai', 'gemini'] as const

      providers.forEach((provider) => {
        const error = new AgentError(AgentErrorType.API_ERROR, 'Test message', provider)
        expect(error.provider).toBe(provider)
      })
    })
  })

  describe('error message formatting', () => {
    it('should include provider information in error message', () => {
      const error = new AgentError(AgentErrorType.API_ERROR, 'Custom message', 'openai')
      expect(error.message).toBe('Custom message')
      expect(error.provider).toBe('openai')
    })

    it('should preserve stack trace', () => {
      const error = new AgentError(AgentErrorType.NETWORK_ERROR, 'Test error', 'openai')
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AgentError')
    })
  })

  describe('error inheritance', () => {
    it('should be instance of Error', () => {
      const error = new AgentError(AgentErrorType.API_ERROR, 'Test message', 'openai')
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AgentError)
    })

    it('should be catchable as Error', () => {
      try {
        throw new AgentError(AgentErrorType.API_ERROR, 'Test error', 'openai')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(AgentError)
      }
    })
  })
})
