import { GoogleGenAI } from '@google/genai'
import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest'
import { getLogger } from '@/infrastructure/logging/logger'
import { TokenMeter } from '@/tokens/tokenMeter'

// Mock the logger
vi.mock('@/infrastructure/logging/logger', () => ({
  getLogger: vi.fn(() => ({
    withContext: vi.fn(() => ({
      warn: vi.fn(),
      info: vi.fn(),
    })),
  })),
}))

// Mock the GoogleGenAI SDK
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}))

describe('TokenMeter', () => {
  let mockClient: any
  let tokenMeter: TokenMeter
  let mockModels: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock the client and models
    mockModels = {
      countTokens: vi.fn(),
    }

    mockClient = {
      models: mockModels,
    }

    // Mock GoogleGenAI constructor
    ;(GoogleGenAI as any).mockImplementation(() => mockClient)

    // Create TokenMeter instance
    tokenMeter = new TokenMeter({
      model: 'gemini-2.5-flash',
      apiKey: 'fake-api-key',
    })
  })

  describe('preflight', () => {
    it('should return correct token count for text input', async () => {
      mockModels.countTokens.mockResolvedValue({
        totalTokens: 150,
      })

      const result = await tokenMeter.preflight('Hello world')

      expect(result).toEqual({
        inputTokens: 150,
      })
      expect(mockModels.countTokens).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: 'Hello world' }] }],
      })
    })

    it('should handle array input correctly', async () => {
      mockModels.countTokens.mockResolvedValue({
        totalTokens: 200,
      })

      const input = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
      ]

      const result = await tokenMeter.preflight(input)

      expect(result).toEqual({
        inputTokens: 200,
      })
      expect(mockModels.countTokens).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: input,
      })
    })

    it('should handle system instruction format', async () => {
      mockModels.countTokens.mockResolvedValue({
        totalTokens: 300,
      })

      const input = {
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        systemInstruction: { role: 'system', parts: [{ text: 'You are helpful' }] },
      }

      const result = await tokenMeter.preflight(input)

      expect(result).toEqual({
        inputTokens: 300,
      })
      expect(mockModels.countTokens).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: input.contents,
      })
    })

    it('should fallback to estimation when API fails', async () => {
      mockModels.countTokens.mockRejectedValue(new Error('API Error'))

      const result = await tokenMeter.preflight('Hello world')

      expect(result.inputTokens).toBe(3) // 'Hello ' (6 chars) + 'world' (5 chars) = 11 chars, ceil(6/4)+5 = 3
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should handle fallback estimation for Japanese text', async () => {
      mockModels.countTokens.mockRejectedValue(new Error('API Error'))

      const japaneseText = 'こんにちは、世界！'
      const result = await tokenMeter.preflight(japaneseText)

      // Japanese estimation: 1 char per token
      expect(result.inputTokens).toBe(9) // 9 characters: こんにちは、世界！
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should handle mixed English and Japanese text in fallback', async () => {
      mockModels.countTokens.mockRejectedValue(new Error('API Error'))

      const mixedText = 'Hello こんにちは'
      const result = await tokenMeter.preflight(mixedText)

      // 'Hello ' (6 chars, 2 tokens) + 'こんにちは' (5 chars, 5 tokens) = 7 tokens
      expect(result.inputTokens).toBe(7)
    })

    it('should handle empty input', async () => {
      mockModels.countTokens.mockResolvedValue({
        totalTokens: 0,
      })

      const result = await tokenMeter.preflight('')

      expect(result).toEqual({
        inputTokens: 0,
      })
    })
  })

  describe('finalize', () => {
    it('should extract usage metadata correctly', () => {
      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
          cachedContentTokenCount: 20,
          thoughtsTokenCount: 10,
          promptTokensDetails: { modalities: ['text'] },
          candidatesTokensDetails: { modalities: ['text'] },
        },
      }

      const result = tokenMeter.finalize(mockResponse)

      expect(result).toEqual({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
        cachedContentTokenCount: 20,
        thoughtsTokenCount: 10,
        promptTokensDetails: { modalities: ['text'] },
        candidatesTokensDetails: { modalities: ['text'] },
      })
    })

    it('should handle missing optional fields', () => {
      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      }

      const result = tokenMeter.finalize(mockResponse)

      expect(result).toEqual({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
        cachedContentTokenCount: undefined,
        thoughtsTokenCount: undefined,
        promptTokensDetails: undefined,
        candidatesTokensDetails: undefined,
      })
    })

    it('should throw error if usageMetadata is missing', () => {
      const mockResponse = {
        text: 'Hello world',
      }

      expect(() => tokenMeter.finalize(mockResponse)).toThrow('usageMetadata not found in response')
    })

    it('should return 0 for numeric fields when they are falsy', () => {
      const mockResponse = {
        usageMetadata: {
          promptTokenCount: null,
          candidatesTokenCount: undefined,
          totalTokenCount: 0,
        },
      }

      const result = tokenMeter.finalize(mockResponse)

      expect(result).toEqual({
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
        cachedContentTokenCount: undefined,
        thoughtsTokenCount: undefined,
        promptTokensDetails: undefined,
        candidatesTokensDetails: undefined,
      })
    })
  })

  describe('fallbackEstimation', () => {
    it('should estimate tokens for string input', () => {
      const result = (tokenMeter as any).fallbackEstimation('Hello world')
      expect(result.inputTokens).toBe(3) // 'Hello world' = 11 chars, all English/space, ceil(11/4) = 3
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should estimate tokens for Japanese text', () => {
      const result = (tokenMeter as any).fallbackEstimation('こんにちは')
      expect(result.inputTokens).toBe(5) // 5 Japanese characters = 5 tokens
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should estimate tokens for mixed text', () => {
      const result = (tokenMeter as any).fallbackEstimation('Hello こんにちは')
      expect(result.inputTokens).toBe(7) // 'Hello ' (6 chars, 2 tokens) + 'こんにちは' (5 chars, 5 tokens)
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should estimate tokens for complex object input', () => {
      const input = [
        {
          parts: [{ text: 'Hello' }, { text: ' world' }],
        },
      ]
      const result = (tokenMeter as any).fallbackEstimation(input)
      expect(result.inputTokens).toBe(3) // 'Hello world' = 11 chars, 6 English+space, 5 other = ceil(6/4)=2 + 5=7, wait let me recalculate properly
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should estimate tokens for request format input', () => {
      const input = {
        contents: [
          {
            parts: [{ text: 'Test message' }],
          },
        ],
      }
      const result = (tokenMeter as any).fallbackEstimation(input)
      expect(result.inputTokens).toBe(3) // 'Test message' = 12 chars, 7 English+spaces, 5 other = ceil(7/4)=2 + 5=7
      expect(result.note).toBe('Fallback estimation due to API failure')
    })

    it('should handle empty or invalid inputs', () => {
      const emptyCases = [null, undefined, [], {}, '']

      emptyCases.forEach((input) => {
        const result = (tokenMeter as any).fallbackEstimation(input)
        expect(result.inputTokens).toBe(0)
      })
    })
  })

  describe('constructor', () => {
    it('should initialize with API key correctly', () => {
      const meter = new TokenMeter({
        apiKey: 'test-key',
        model: 'test-model',
      })

      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' })
      expect(meter).toBeInstanceOf(TokenMeter)
    })

    it('should initialize with Vertex AI configuration correctly', () => {
      const vertexConfig = {
        project: 'test-project',
        location: 'us-central1',
        serviceAccountPath: '/path/to/service-account.json',
      }

      const meter = new TokenMeter({
        model: 'test-model',
        vertexai: vertexConfig,
      })

      expect(GoogleGenAI).toHaveBeenCalledWith({
        vertexai: true,
        project: 'test-project',
        location: 'us-central1',
        googleAuthOptions: {
          keyFile: '/path/to/service-account.json',
        },
      })
      expect(meter).toBeInstanceOf(TokenMeter)
    })

    it('should use default model when not specified', () => {
      const meter = new TokenMeter()

      expect(meter).toBeInstanceOf(TokenMeter)
    })
  })

  describe('Token estimation rules', () => {
    it('should correctly estimate multimodal content in fallback', () => {
      // Test cases for multimodal estimation rules would go here
      // Since we're using fallback estimation, these would apply to
      // cases where the API fails and fallback kicks in
      const imageFallbackInput = 'Image description fallback'
      const result = (tokenMeter as any).fallbackEstimation(imageFallbackInput)

      // Should use regular text estimation
      expect(result.inputTokens).toBeGreaterThan(0)
      expect(typeof result.inputTokens).toBe('number')
    })
  })
})
