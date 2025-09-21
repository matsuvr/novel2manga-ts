/**
 * LLMログサービス - novelId毎にタイムスタンプファイル名でLLMリクエスト/レスポンスを保存
 *
 * 設計方針:
 * - 全てのLLMやりとりを無条件で記録（LLM_LOGGING環境変数不要）
 * - storage/llm_log/{novelId}/{timestamp}.json形式で保存
 * - タイムスタンプはISO形式をファイル名に適したハイフン区切りに変換
 * - リクエスト・レスポンス・エラー情報を構造化JSONで保存
 */

import { getLogger } from '@/infrastructure/logging/logger'
import { getLlmLogStorage, StorageKeys } from '@/utils/storage'

export interface LlmLogEntry {
  timestamp: string
  novelId: string
  provider: string
  model?: string
  requestType: 'chat' | 'generateStructured'
  request: {
    systemPrompt?: string
    userPrompt?: string
    messages?: Array<{ role: string; content: string }>
    schema?: string
    schemaName?: string
    options?: {
      maxTokens?: number
      temperature?: number
      [key: string]: unknown
    }
  }
  response?: {
    content?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  error?: {
    message: string
    stack?: string
  }
  telemetry?: {
    jobId?: string
    agentName?: string
    stepName?: string
    chunkIndex?: number
    episodeNumber?: number
    retryAttempt?: number
    cacheHit?: boolean
  }
  duration?: number // ミリ秒
}

export class LlmLogService {
  private static instance: LlmLogService | null = null
  private readonly logger = getLogger().withContext({ service: 'LlmLogService' })

  static getInstance(): LlmLogService {
    if (!LlmLogService.instance) {
      LlmLogService.instance = new LlmLogService()
    }
    return LlmLogService.instance
  }

  /**
   * LLMのやりとりをログとして保存
   */
  async logLlmInteraction(entry: Omit<LlmLogEntry, 'timestamp'>): Promise<void> {
    try {
      const timestamp = this.formatTimestampForFilename(new Date())
      const logEntry: LlmLogEntry = {
        ...entry,
        timestamp,
      }

      const storage = await getLlmLogStorage()
      const key = StorageKeys.llmLog(entry.novelId, timestamp)

      await storage.put(key, JSON.stringify(logEntry, null, 2))

      this.logger.debug('LLM interaction logged', {
        novelId: entry.novelId,
        provider: entry.provider,
        requestType: entry.requestType,
        timestamp,
      })
    } catch (error) {
      // ログ保存の失敗は主処理を妨げないが、エラーは記録する
      this.logger.error('Failed to log LLM interaction', {
        error: error instanceof Error ? error.message : String(error),
        novelId: entry.novelId,
        provider: entry.provider,
      })
    }
  }

  /**
   * 指定したnovelIdのLLMログを時系列順に取得
   */
  async getLlmLogs(novelId: string, limit?: number): Promise<LlmLogEntry[]> {
    try {
      const storage = await getLlmLogStorage()
      const prefix = `${novelId}/`

      const keys = await storage.list?.(prefix) || []

      // prefixが重複している場合の修正
      const fixedKeys = keys.map(key => {
        // キーがprefixで始まり、さらにprefixが重複している場合は修正
        if (key.startsWith(prefix + prefix.replace('/', ''))) {
          return key.substring(prefix.length)
        }
        return key
      })

      // タイムスタンプでソート（新しい順）
      const sortedKeys = fixedKeys
        .filter(key => key.endsWith('.json'))
        .sort((a, b) => {
          const timestampA = this.extractTimestampFromKey(a)
          const timestampB = this.extractTimestampFromKey(b)
          return timestampB.localeCompare(timestampA)
        })

      const limitedKeys = limit ? sortedKeys.slice(0, limit) : sortedKeys
      const logs: LlmLogEntry[] = []

      for (const key of limitedKeys) {
        try {
          const result = await storage.get(key)
          if (result) {
            const logEntry = JSON.parse(result.text) as LlmLogEntry
            logs.push(logEntry)
          }
        } catch (error) {
          this.logger.warn('Failed to parse LLM log entry', {
            key,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      return logs
    } catch (error) {
      this.logger.error('Failed to retrieve LLM logs', {
        novelId,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * 指定したnovelIdのLLMログを削除（novel削除時などに使用）
   */
  async deleteLlmLogsForNovel(novelId: string): Promise<void> {
    try {
      const storage = await getLlmLogStorage()
      const prefix = `${novelId}/`
      const keys = await storage.list?.(prefix) || []

      // prefixが重複している場合の修正
      const fixedKeys = keys.map(key => {
        // キーがprefixで始まり、さらにprefixが重複している場合は修正
        if (key.startsWith(prefix + prefix.replace('/', ''))) {
          return key.substring(prefix.length)
        }
        return key
      })

      for (const key of fixedKeys) {
        try {
          await storage.delete(key)
        } catch (error) {
          this.logger.warn('Failed to delete LLM log file', {
            key,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      this.logger.info('Deleted LLM logs for novel', {
        novelId,
        deletedFiles: keys.length,
      })
    } catch (error) {
      this.logger.error('Failed to delete LLM logs for novel', {
        novelId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * タイムスタンプをファイル名に適した形式に変換
   * 例: 2025-09-21T10:30:45.123Z → 2025-09-21T10-30-45-123Z
   */
  private formatTimestampForFilename(date: Date): string {
    return date.toISOString().replace(/[:]/g, '-').replace(/\./g, '-')
  }

  /**
   * ストレージキーからタイムスタンプを抽出
   */
  private extractTimestampFromKey(key: string): string {
    // {novelId}/{timestamp}.json → timestamp部分を抽出
    const parts = key.split('/')
    if (parts.length >= 2) {
      const filename = parts[parts.length - 1]
      return filename.replace('.json', '')
    }
    return ''
  }

  /**
   * ログエントリのサイズを制限するためのサニタイズ
   */
  private sanitizeForLogging(data: unknown): unknown {
    if (typeof data === 'string') {
      // 長いテキストは切り詰める（ログサイズ制限）
      return data.length > 10000 ? `${data.substring(0, 10000)}...[truncated]` : data
    }
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeForLogging(item))
    }
    if (typeof data === 'object' && data !== null) {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.sanitizeForLogging(value)
      }
      return result
    }
    return data
  }

  /**
   * リクエストデータをサニタイズしてログ用に整形
   */
  sanitizeRequest(request: unknown): LlmLogEntry['request'] {
    const sanitized = this.sanitizeForLogging(request) as Record<string, unknown>
    return {
      systemPrompt: typeof sanitized.systemPrompt === 'string' ? sanitized.systemPrompt : undefined,
      userPrompt: typeof sanitized.userPrompt === 'string' ? sanitized.userPrompt : undefined,
      messages: Array.isArray(sanitized.messages) ? sanitized.messages as Array<{ role: string; content: string }> : undefined,
      schema: typeof sanitized.schema === 'string' ? sanitized.schema : undefined,
      schemaName: typeof sanitized.schemaName === 'string' ? sanitized.schemaName : undefined,
      options: typeof sanitized.options === 'object' && sanitized.options !== null ? sanitized.options as Record<string, unknown> : undefined,
    }
  }

  /**
   * レスポンスデータをサニタイズしてログ用に整形
   */
  sanitizeResponse(response: unknown): LlmLogEntry['response'] {
    const sanitized = this.sanitizeForLogging(response) as Record<string, unknown>
    return sanitized
  }
}