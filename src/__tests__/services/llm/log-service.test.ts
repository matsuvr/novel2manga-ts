/**
 * LLMログサービスのテスト
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearStorageCache } from '@/utils/storage'
import { LlmLogService } from '../../../services/llm/log-service'

describe('LlmLogService', () => {
  let tempDir: string
  let originalBasePath: string | undefined

  beforeEach(() => {
    // テスト用の一時ディレクトリを作成
    tempDir = mkdtempSync(path.join(tmpdir(), 'llm-log-test-'))

    // 環境変数を設定してテスト用ディレクトリを使用
    originalBasePath = process.env.BASE_STORAGE_PATH
    process.env.BASE_STORAGE_PATH = tempDir

    clearStorageCache()
  })

  afterEach(() => {
    // 環境変数を復元
    if (originalBasePath !== undefined) {
      process.env.BASE_STORAGE_PATH = originalBasePath
    } else {
      delete process.env.BASE_STORAGE_PATH
    }

    // 一時ディレクトリをクリーンアップ
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
    clearStorageCache()
  })

  describe('logLlmInteraction', () => {
    it('novelIdが指定された場合にログを保存する', async () => {
      const logService = LlmLogService.getInstance()

      const testEntry = {
        novelId: 'test-novel-123',
        provider: 'openai',
        model: 'gpt-4',
        requestType: 'chat' as const,
        request: {
          messages: [
            { role: 'user' as const, content: 'Hello, world!' },
          ],
          options: { maxTokens: 100 },
        },
        response: {
          content: 'Hello! How can I help you today?',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
        },
        telemetry: {
          jobId: 'test-job-456',
          agentName: 'test-agent',
        },
        duration: 1500,
      }

      // ログを記録
      await logService.logLlmInteraction(testEntry)

      // ログが取得できることを確認
      const logs = await logService.getLlmLogs('test-novel-123')
      expect(logs).toHaveLength(1)

      const savedLog = logs[0]
      expect(savedLog.novelId).toBe('test-novel-123')
      expect(savedLog.provider).toBe('openai')
      expect(savedLog.model).toBe('gpt-4')
      expect(savedLog.requestType).toBe('chat')
      expect(savedLog.request.messages).toEqual([
        { role: 'user', content: 'Hello, world!' },
      ])
      expect(savedLog.response?.content).toBe('Hello! How can I help you today?')
      expect(savedLog.telemetry?.jobId).toBe('test-job-456')
      expect(savedLog.duration).toBe(1500)
      expect(savedLog.timestamp).toBeDefined()
    })

    it('エラーが発生した場合もログを保存する', async () => {
      const logService = LlmLogService.getInstance()

      const testEntry = {
        novelId: 'test-novel-123',
        provider: 'openai',
        requestType: 'generateStructured' as const,
        request: {
          systemPrompt: 'You are a helpful assistant',
          userPrompt: 'Generate structured data',
          schema: '{ "type": "object" }',
          schemaName: 'TestSchema',
        },
        error: {
          message: 'API rate limit exceeded',
          stack: 'Error stack trace...',
        },
        duration: 500,
      }

      await logService.logLlmInteraction(testEntry)

      const logs = await logService.getLlmLogs('test-novel-123')
      expect(logs).toHaveLength(1)

      const savedLog = logs[0]
      expect(savedLog.error?.message).toBe('API rate limit exceeded')
      expect(savedLog.response).toBeUndefined()
    })
  })

  describe('getLlmLogs', () => {
    it('指定したnovelIdのログを時系列順に取得する', async () => {
      const logService = LlmLogService.getInstance()

      // 複数のログを保存
      await logService.logLlmInteraction({
        novelId: 'test-novel-123',
        provider: 'openai',
        requestType: 'chat',
        request: { messages: [{ role: 'user', content: 'First message' }] },
        response: { content: 'First response' },
      })

      // 少し待機してタイムスタンプが異なることを保証
      await new Promise(resolve => setTimeout(resolve, 10))

      await logService.logLlmInteraction({
        novelId: 'test-novel-123',
        provider: 'groq',
        requestType: 'chat',
        request: { messages: [{ role: 'user', content: 'Second message' }] },
        response: { content: 'Second response' },
      })

      const logs = await logService.getLlmLogs('test-novel-123')
      expect(logs).toHaveLength(2)

      // 新しい順でソートされているか確認
      expect(logs[0].response?.content).toBe('Second response')
      expect(logs[1].response?.content).toBe('First response')
    })

    it('限定数でログを取得する', async () => {
      const logService = LlmLogService.getInstance()

      // 3つのログを保存
      for (let i = 0; i < 3; i++) {
        await logService.logLlmInteraction({
          novelId: 'test-novel-123',
          provider: 'openai',
          requestType: 'chat',
          request: { messages: [{ role: 'user', content: `Message ${i}` }] },
          response: { content: `Response ${i}` },
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      const logs = await logService.getLlmLogs('test-novel-123', 2)
      expect(logs).toHaveLength(2)
    })

    it('存在しないnovelIdの場合は空配列を返す', async () => {
      const logService = LlmLogService.getInstance()

      const logs = await logService.getLlmLogs('non-existent-novel')
      expect(logs).toEqual([])
    })
  })

  describe('deleteLlmLogsForNovel', () => {
    it('指定したnovelIdのログをすべて削除する', async () => {
      const logService = LlmLogService.getInstance()

      // ログを保存
      await logService.logLlmInteraction({
        novelId: 'test-novel-123',
        provider: 'openai',
        requestType: 'chat',
        request: { messages: [{ role: 'user', content: 'Test message' }] },
        response: { content: 'Test response' },
      })

      // ログが存在することを確認
      let logs = await logService.getLlmLogs('test-novel-123')
      expect(logs).toHaveLength(1)

      // ログを削除
      await logService.deleteLlmLogsForNovel('test-novel-123')

      // ログが削除されたことを確認
      logs = await logService.getLlmLogs('test-novel-123')
      expect(logs).toHaveLength(0)
    })
  })

  describe('sanitization', () => {
    it('長いテキストを切り詰める', () => {
      const logService = LlmLogService.getInstance()

      const longText = 'a'.repeat(20000)
      const sanitized = logService.sanitizeRequest({
        userPrompt: longText,
      })

      expect(sanitized.userPrompt).toBeDefined()
      expect(sanitized.userPrompt!.length).toBeLessThan(longText.length)
      expect(sanitized.userPrompt!).toContain('...[truncated]')
    })
  })
})