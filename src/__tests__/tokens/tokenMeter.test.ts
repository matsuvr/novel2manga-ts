import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest'
import { GoogleGenAI } from '@google/genai'
import { TokenMeter } from '@/tokens/tokenMeter'
import { getLogger } from '@/infrastructure/logging/logger'

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

      const result = await tokenMeter.preflight('Hello world this is a test')

      // English text estimation: 4 chars per token approx
      // "Hello world this is a test" = ~27 chars = ~7 tokens
      expect(result.inputTokens).toBeGreaterThan(0)
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

      const mixedText = 'Hello こんにちは world 世界'
      const result = await tokenMeter.preflight(mixedText)

      // Count English characters [a-zA-Z] and spaces
      const englishChars = (mixedText.match(/[a-zA-Z\s]/g) || []).length
      // Count all characters - English = Japanese/other characters
      const totalChars = mixedText.length
      const otherChars = totalChars - englishChars
      // English: ceil(count/4), Japanese: 1 per char
      const expected = Math.ceil(englishChars / 4) + otherChars

      expect(result.inputTokens).toBe(expected)
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

      expect(() => tokenMeter.finalize(mockResponse)).toThrow(
        'usageMetadata not found in response',
      )
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
    it('should estimate tokens for various input types', () => {
      const testCases = [
        // String input
        {
          input: 'Hello world',
          expected: Math.ceil(11 / 4), // 11 chars English
        },
        // Japanese input
        {
          input: 'こんにちは',
          expected: 5, // 5 chars Japanese
        },
        // Mixed input
        {
          input: 'Hello こんにちは',
          expected: Math.ceil(6 / 4) + 5, // 'Hello ' (6 chars) + 'こんにちは' (5 chars)
        },
        // Complex object with parts
        {
          input: [
            {
              parts: [
                { text: 'Hello' },
                { text: ' world' },
              ],
            },
          ],
          expected: Math.ceil(11 / 4), // 'Hello world'
        },
        // Request format with contents
        {
          input: {
            contents: [
              {
                parts: [{ text: 'Test message' }],
              },
            ],
          },
          expected: Math.ceil(12 / 4), // 'Test message'
        },
      ]

      testCases.forEach(({ input, expected }) => {
        const result = (tokenMeter as any).fallbackEstimation(input)
        expect(result.inputTokens).toBe(expected)
        expect(result.note).toBe('Fallback estimation due to API failure')
      })
    })

    it('should handle empty or invalid inputs', () => {
      const emptyCases = [
        null,
        undefined,
        [],
        {},
        '',
      ]

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
