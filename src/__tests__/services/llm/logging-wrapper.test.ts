/**
 * LLMログラッパークライアントのテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LlmClient, LlmMessage, LlmResponse } from '@/llm/client'
import { wrapWithNewLlmLogging } from '../../../services/llm/logging-wrapper'

// モック設定
vi.mock('@/utils/job', () => ({
  getNovelIdForJob: vi.fn(),
}))

// 共有されるモックログサービスインスタンスを作成
const mockLogServiceInstance = {
  logLlmInteraction: vi.fn(),
  sanitizeRequest: vi.fn((req) => req),
  sanitizeResponse: vi.fn((res) => res),
}

vi.mock('../../../services/llm/log-service', () => ({
  LlmLogService: {
    getInstance: vi.fn(() => mockLogServiceInstance),
  },
}))

describe('LoggingLlmClientWrapper', () => {
  let mockInnerClient: LlmClient
  let getNovelIdForJobMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // 内部クライアントのモック
    mockInnerClient = {
      provider: 'openai',
      chat: vi.fn(),
    } as LlmClient

    // getNovelIdForJobのモック
    const { getNovelIdForJob } = await import('@/utils/job')
    getNovelIdForJobMock = getNovelIdForJob as ReturnType<typeof vi.fn>

    vi.clearAllMocks()
  })

  describe('chat method', () => {
    it('jobIdからnovelIdを取得してログを記録する', async () => {
      const mockResponse: LlmResponse = {
        content: 'Test response',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      }

      // モックの設定
      mockInnerClient.chat = vi.fn().mockResolvedValue(mockResponse)
      getNovelIdForJobMock.mockResolvedValue('test-novel-123')

      const wrappedClient = wrapWithNewLlmLogging(mockInnerClient, false)

      const messages: LlmMessage[] = [
        { role: 'user', content: 'Test message' },
      ]
      const options = {
        maxTokens: 100,
        telemetry: { jobId: 'test-job-456' },
      }

      const result = await wrappedClient.chat(messages, options)

      // 結果が正しく返されることを確認
      expect(result).toEqual(mockResponse)

      // 内部クライアントが呼ばれることを確認
      expect(mockInnerClient.chat).toHaveBeenCalledWith(messages, options)

      // novelId取得が呼ばれることを確認
      expect(getNovelIdForJobMock).toHaveBeenCalledWith('test-job-456')

      // ログが記録されることを確認
      expect(mockLogServiceInstance.logLlmInteraction).toHaveBeenCalledWith({
        novelId: 'test-novel-123',
        provider: 'openai',
        model: undefined,
        requestType: 'chat',
        request: { messages, options },
        response: mockResponse,
        error: undefined,
        telemetry: { jobId: 'test-job-456' },
        duration: expect.any(Number),
      })
    })

    it('jobIdが無い場合はログを記録しない', async () => {
      const mockResponse: LlmResponse = {
        content: 'Test response',
      }

      mockInnerClient.chat = vi.fn().mockResolvedValue(mockResponse)

      const wrappedClient = wrapWithNewLlmLogging(mockInnerClient, false)

      const messages: LlmMessage[] = [
        { role: 'user', content: 'Test message' },
      ]
      const options = { maxTokens: 100 }

      const result = await wrappedClient.chat(messages, options)

      expect(result).toEqual(mockResponse)
      expect(getNovelIdForJobMock).not.toHaveBeenCalled()
      expect(mockLogServiceInstance.logLlmInteraction).not.toHaveBeenCalled()
    })

    it('novelId取得に失敗した場合はログを記録しない', async () => {
      const mockResponse: LlmResponse = {
        content: 'Test response',
      }

      mockInnerClient.chat = vi.fn().mockResolvedValue(mockResponse)
      getNovelIdForJobMock.mockRejectedValue(new Error('Job not found'))

      const wrappedClient = wrapWithNewLlmLogging(mockInnerClient, false)

      const messages: LlmMessage[] = [
        { role: 'user', content: 'Test message' },
      ]
      const options = {
        maxTokens: 100,
        telemetry: { jobId: 'invalid-job' },
      }

      const result = await wrappedClient.chat(messages, options)

      expect(result).toEqual(mockResponse)
      expect(getNovelIdForJobMock).toHaveBeenCalledWith('invalid-job')
      expect(mockLogServiceInstance.logLlmInteraction).not.toHaveBeenCalled()
    })

    it('エラーが発生した場合もログを記録する', async () => {
      const testError = new Error('API Error')

      mockInnerClient.chat = vi.fn().mockRejectedValue(testError)
      getNovelIdForJobMock.mockResolvedValue('test-novel-123')

      const wrappedClient = wrapWithNewLlmLogging(mockInnerClient, false)

      const messages: LlmMessage[] = [
        { role: 'user', content: 'Test message' },
      ]
      const options = {
        maxTokens: 100,
        telemetry: { jobId: 'test-job-456' },
      }

      await expect(wrappedClient.chat(messages, options)).rejects.toThrow('API Error')

      // エラーログが記録されることを確認
      expect(mockLogServiceInstance.logLlmInteraction).toHaveBeenCalledWith({
        novelId: 'test-novel-123',
        provider: 'openai',
        model: undefined,
        requestType: 'chat',
        request: { messages, options },
        response: undefined,
        error: {
          message: 'API Error',
          stack: expect.any(String),
        },
        telemetry: { jobId: 'test-job-456' },
        duration: expect.any(Number),
      })
    })
  })

  describe('embeddings delegation', () => {
    it('embeddingsメソッドを正しく委譲する', () => {
      const mockEmbeddings = vi.fn()
      mockInnerClient.embeddings = mockEmbeddings

      const wrappedClient = wrapWithNewLlmLogging(mockInnerClient, false)

      expect(wrappedClient.embeddings).toBe(mockEmbeddings)
    })
  })
})