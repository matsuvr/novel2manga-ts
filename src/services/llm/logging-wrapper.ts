/**
 * LLMクライアントラッパー - 新しいログサービスを使用
 *
 * 既存のLLMクライアントをラップして、全てのリクエスト/レスポンスを
 * novelId毎にタイムスタンプファイル名でストレージに保存する
 */

import { getLogger } from '@/infrastructure/logging/logger'
import type { LlmClient, LlmClientOptions, LlmMessage, LlmResponse } from '@/llm/client'
import { getNovelIdForJob } from '@/utils/job'
import { LlmLogService } from './log-service'

export class LoggingLlmClientWrapper implements LlmClient {
  readonly provider: string
  private readonly inner: LlmClient
  private readonly logService: LlmLogService
  private readonly logger = getLogger().withContext({ service: 'LoggingLlmClientWrapper' })

  constructor(inner: LlmClient) {
    this.inner = inner
    this.provider = inner.provider
    this.logService = LlmLogService.getInstance()
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    const startTime = Date.now()
    let novelId: string | null = null
    let response: LlmResponse | undefined
    let error: Error | undefined

    try {
      // telemetryのjobIdからnovelIdを取得を試行（失敗時はログのみ記録）
      const jobId = (options as { telemetry?: { jobId?: string } }).telemetry?.jobId
      if (jobId) {
        try {
          novelId = await getNovelIdForJob(jobId)
        } catch (e) {
          this.logger.debug('Failed to resolve novelId from jobId', {
            jobId,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      response = await this.inner.chat(messages, options)
      return response
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e))
      throw error
    } finally {
      // novelIdが取得できた場合のみログを記録
      if (novelId) {
        const duration = Date.now() - startTime
        await this.logService.logLlmInteraction({
          novelId,
          provider: this.provider,
          model: options.model,
          requestType: 'chat',
          request: this.logService.sanitizeRequest({
            messages,
            options,
          }),
          response: response ? this.logService.sanitizeResponse(response) : undefined,
          error: error ? { message: error.message, stack: error.stack } : undefined,
          telemetry: (options as { telemetry?: unknown }).telemetry as {
            jobId?: string
            agentName?: string
            stepName?: string
            chunkIndex?: number
            episodeNumber?: number
            retryAttempt?: number
            cacheHit?: boolean
          },
          duration,
        })
      }
    }
  }

  // LlmClient の chat 以外のメソッドは内部クライアントに委譲
  get embeddings() {
    return this.inner.embeddings
  }
}

/**
 * Structured Generator用のラッパークライアント
 */
export class StructuredLoggingLlmClientWrapper implements LlmClient {
  readonly provider: string
  private readonly inner: LlmClient
  private readonly logService: LlmLogService
  private readonly logger = getLogger().withContext({ service: 'StructuredLoggingLlmClientWrapper' })

  constructor(inner: LlmClient) {
    this.inner = inner
    this.provider = inner.provider
    this.logService = LlmLogService.getInstance()
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    // StructuredLoggingLlmClientWrapperは主に構造化生成用なので、
    // chatは内部クライアントに委譲
    return this.inner.chat(messages, options)
  }

  async generateStructured<T = unknown>(params: {
    messages: LlmMessage[]
    schema: Record<string, unknown>
    schemaName?: string
    options?: LlmClientOptions
  }): Promise<T> {
    const startTime = Date.now()
    let novelId: string | null = null
    let response: T | undefined
    let error: Error | undefined

    try {
      // optionsにtelemetryがある場合はjobIdからnovelIdを取得を試行
      if (params.options && 'telemetry' in params.options) {
        const telemetry = params.options.telemetry as { jobId?: string }
        const jobId = telemetry?.jobId
        if (jobId) {
          try {
            novelId = await getNovelIdForJob(jobId)
          } catch (e) {
            this.logger.debug('Failed to resolve novelId from jobId', {
              jobId,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }
      }

      response = await this.inner.generateStructured?.(params)
      return response as T
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e))
      throw error
    } finally {
      // novelIdが取得できた場合のみログを記録
      if (novelId) {
        const duration = Date.now() - startTime
        await this.logService.logLlmInteraction({
          novelId,
          provider: this.provider,
          model: this.getModelFromConfig(),
          requestType: 'generateStructured',
          request: this.logService.sanitizeRequest({
            messages: params.messages,
            schema: JSON.stringify(params.schema),
            schemaName: params.schemaName || 'unknown',
            options: params.options,
          }),
          response: response ? this.logService.sanitizeResponse(response) : undefined,
          error: error ? { message: error.message, stack: error.stack } : undefined,
          telemetry: params.options && 'telemetry' in params.options
            ? (params.options.telemetry as Record<string, unknown>)
            : undefined,
          duration,
        })
      }
    }
  }

  private getModelFromConfig(): string | undefined {
    // プロバイダー設定からモデル名を取得（設定可能であれば）
    try {
      const { getLLMProviderConfig } = require('@/config/llm.config')
      const config = getLLMProviderConfig(this.provider as 'openai' | 'groq' | 'vertexai' | 'gemini')
      return config?.model
    } catch {
      return undefined
    }
  }
}

/**
 * LlmClientをログ機能付きでラップする関数
 */
export function wrapWithNewLlmLogging(client: LlmClient, useStructured = false): LlmClient {
  if (useStructured) {
    return new StructuredLoggingLlmClientWrapper(client)
  }
  return new LoggingLlmClientWrapper(client)
}