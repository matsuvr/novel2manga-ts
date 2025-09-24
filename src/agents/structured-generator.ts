import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { createClientForProvider, selectProviderOrder } from '@/agents/llm/router'
import type { LlmClient, LlmProvider } from '@/agents/llm/types'
import { getAppConfigWithOverrides } from '@/config/app.config'
import {
  CONNECTIVITY_ERROR_PATTERNS,
  HTTP_ERROR_PATTERNS,
  JSON_SCHEMA_ERROR_PATTERNS,
  RETRYABLE_JSON_ERROR_PATTERNS,
} from '@/errors/error-patterns'
import { getLogger } from '@/infrastructure/logging/logger'
import { wrapWithNewLlmLogging } from '@/services/llm/logging-wrapper'

// 旧 llm/client の InvalidRequestError を簡易再実装（構造化生成で userPrompt 空を検出するため）
class InvalidRequestError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'InvalidRequestError'
    this.field = field
  }
}

import { normalizeLLMResponse } from '@/utils/dialogue-normalizer'
import { getLLMProviderConfig } from '../config/llm.config'

const MAX_CACHE_ENTRIES = 200

const responseCache = new Map<string, Promise<unknown>>()

function normalizePromptValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cloneResult<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function trimCache(): void {
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value as string | undefined
    if (!oldestKey) break
    responseCache.delete(oldestKey)
  }
}

function reorderCache(key: string): void {
  const existing = responseCache.get(key)
  if (existing === undefined) return
  responseCache.delete(key)
  responseCache.set(key, existing)
}

function createCacheKey(
  provider: LlmProvider,
  schemaName: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  model: string,
): string {
  const hash = createHash('sha256')
  hash.update(provider)
  hash.update('\u241F')
  hash.update(schemaName)
  hash.update('\u241F')
  hash.update(systemPrompt)
  hash.update('\u241F')
  hash.update(userPrompt)
  hash.update('\u241F')
  hash.update(String(maxTokens))
  hash.update('\u241F')
  hash.update(model)

  return hash.digest('hex')
}

export interface GenerateArgs<T> {
  name?: string
  systemPrompt?: string
  userPrompt: string
  schema: z.ZodType<T>
  schemaName: string
  telemetry?: import('@/agents/llm/types').LlmTelemetryContext
}

export class DefaultLlmStructuredGenerator {
  private readonly providerOrder: LlmProvider[]
  constructor(providerOrder?: LlmProvider[]) {
    this.providerOrder =
      providerOrder && providerOrder.length > 0 ? providerOrder : selectProviderOrder()
  }

  // 接続/HTTP 5xx のみフォールバック許可。応答後(JSON/検証)や4xxは即停止。
  async generateObjectWithFallback<T>(args: GenerateArgs<T>): Promise<T> {
    const { name = 'Structured Generator' } = args
    let lastError: unknown
    for (let i = 0; i < this.providerOrder.length; i++) {
      const provider = this.providerOrder[i]
      const client = this.createClient(provider)
      try {
        return await this.generateWithClient(client, args)
      } catch (e) {
        lastError = e
        const reason = e instanceof Error ? e.message : String(e)
        if (this.isPostResponseError(reason)) {
          throw e
        }
        const next = this.providerOrder[i + 1]
        if (!next) throw e
        getLogger()
          .withContext({ service: 'llm-structured-generator', name })
          .warn('LLM provider switch due to connectivity error', {
            from: provider,
            to: next,
            reason: truncate(reason, 500),
          })
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private async generateWithClient<T>(client: LlmClient, args: GenerateArgs<T>): Promise<T> {
    const { systemPrompt, userPrompt, schema, schemaName, name = 'Structured Generator' } = args
    const prov = client.provider
    const cfg = getLLMProviderConfig(prov)
    const maxTokens = cfg?.maxTokens
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens <= 0) {
      throw new Error(`Missing maxTokens in llm.config.ts for provider: ${prov}`)
    }
    const model = cfg.model

    const logger = getLogger().withContext({ service: 'llm-structured-generator', name })

    // Guard: prevent sending empty user prompt which leads to provider SDK errors
    const trimmedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : ''
    if (!trimmedUserPrompt) {
      logger.error('Empty userPrompt detected before LLM call - aborting request', {
        reason: 'userPrompt is empty after trim',
        telemetry: args.telemetry,
      })
      // throw structured invalid request error so callers can handle it
      throw new InvalidRequestError('userPrompt is empty - aborting LLM request', 'userPrompt')
    }

    const normalizedSystemPrompt = normalizePromptValue(systemPrompt)
    const telemetryBase = args.telemetry
      ? {
          ...args.telemetry,
          agentName: args.telemetry.agentName || args.name || 'llm-structured-generator',
        }
      : args.name
        ? { agentName: args.name }
        : undefined

    const cacheKey = createCacheKey(
      prov,
      schemaName,
      normalizedSystemPrompt,
      trimmedUserPrompt,
      maxTokens,
      model,
    )

    const cachedPromise = responseCache.get(cacheKey)
    if (cachedPromise) {
      reorderCache(cacheKey)
      logger.info('Skipping LLM call due to cache hit', {
        provider: prov,
        schemaName,
        jobId: telemetryBase?.jobId,
        chunkIndex: telemetryBase?.chunkIndex,
        cacheHit: true,
      })
      const cachedValue = await cachedPromise
      return cloneResult(cachedValue as T)
    }

    // In-flight coalescing: insert a placeholder promise before starting work
  let resolveOuter: (v: unknown) => void = (_v) => { void 0 }
  let rejectOuter: (e: unknown) => void = (_e) => { void 0 }
    const outerPromise = new Promise<unknown>((resolve, reject) => {
      resolveOuter = resolve
      rejectOuter = reject
    })
    // TypeScript will ensure initialization before use due to control flow
    responseCache.set(cacheKey, outerPromise)
    trimCache()

    const generationPromise = (async (): Promise<T> => {
      // Load retry config from app.config (with env overrides) for JSON/schema retry attempts
      const appCfg = getAppConfigWithOverrides()
      const retryCfg = appCfg?.processing?.retry ?? {
        maxAttempts: 1,
        initialDelay: 500,
        maxDelay: 10_000,
        backoffFactor: 2,
      }
      // Ensure sane bounds
      const maxRetries = Math.max(1, Math.min(5, Number(retryCfg.maxAttempts) || 1))
      const initialDelay = Math.max(0, Number(retryCfg.initialDelay) || 500)
      const backoffFactor = Math.max(1, Number(retryCfg.backoffFactor) || 2)
      const maxDelayMs = Math.max(initialDelay, Number(retryCfg.maxDelay) || 10_000)
      let lastError: unknown

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const telemetryForAttempt = telemetryBase
            ? { ...telemetryBase, retryAttempt: attempt, cacheHit: false }
            : { agentName: args.name || 'llm-structured-generator', retryAttempt: attempt, cacheHit: false }

          // If this is a retry attempt, map known stepNames to their "-Retry" variants for observability
          if (attempt > 1) {
            const stepName = (telemetryForAttempt as { stepName?: unknown }).stepName
            if (typeof stepName === 'string') {
              const retryLabelMap: Record<string, string> = {
                chunkConversion: 'chunkConversion-Retry',
                'episode-break-estimation': 'episode-break-estimation-Retry',
              }
              const mapped = retryLabelMap[stepName]
              if (mapped) {
                ;(telemetryForAttempt as { stepName: string }).stepName = mapped
              }
            }
          }

          const result = await client.generateStructured<T>({
            systemPrompt: normalizedSystemPrompt,
            userPrompt: trimmedUserPrompt,
            spec: { schema, schemaName },
            options: { maxTokens },
            telemetry: telemetryForAttempt,
          })

          // dialogue形式正規化処理を適用（該当する場合のみ）
          const normalizedResult = this.normalizeResultIfNeeded(result)
          return normalizedResult
        } catch (error) {
          lastError = error
          const errorMessage = error instanceof Error ? error.message : String(error)

          // dialogue関連のスキーマエラーの場合、詳細ログを出力
          if (
            errorMessage.includes('schema validation failed') &&
            errorMessage.includes('dialogue')
          ) {
            logger.error('Dialogue schema validation failed - invalid dialogue format', {
              provider: prov,
              attempt,
              error: errorMessage,
              rawResponseSample: errorMessage.includes('Raw:')
                ? errorMessage.split('Raw:')[1]?.slice(0, 500)
                : 'No raw response available',
            })
          }

          // JSON生成関連のエラーのみリトライ対象とする
          const isRetryableJsonError = this.isRetryableJsonError(errorMessage)

          if (!isRetryableJsonError || attempt === maxRetries) {
            // リトライ対象外、または最大試行回数に達した場合は即座にエラーを投げる
            throw error
          }

          // リトライ実行をログ出力
          logger.warn('LLM JSON generation failed, retrying', {
            provider: prov,
            attempt,
            maxRetries,
            reason: truncate(errorMessage, 300),
          })

          // 少し待ってからリトライ（指数バックオフ）
          if (attempt < maxRetries) {
            const delay = Math.min(
              maxDelayMs,
              Math.floor(initialDelay * backoffFactor ** (attempt - 1)),
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    })()
      .then((value) => cloneResult(value))

    try {
      const resolved = await generationPromise
      // Resolve any waiters on the placeholder and keep cache entry for future cache hits
      resolveOuter(resolved)
      return cloneResult(resolved)
    } catch (error) {
      responseCache.delete(cacheKey)
      // Reject any waiters on the placeholder to propagate the error
      rejectOuter(error)
      throw error
    }
  }

  private createClient(provider: LlmProvider): LlmClient {
    // すべての構造化生成呼び出しに LLM ログ記録を付与
    const base = createClientForProvider(provider)
    return wrapWithNewLlmLogging(base, true)
  }

  /**
   * LLM応答にdialogue配列が含まれている場合、正規化処理を適用
   */
  private normalizeResultIfNeeded<T>(result: T): T {
    // 結果がオブジェクトで、pages配列を含む場合（レイアウト生成の場合）
    if (
      typeof result === 'object' &&
      result !== null &&
      'pages' in result &&
      Array.isArray((result as { pages?: unknown[] }).pages)
    ) {
      try {
        return normalizeLLMResponse(result as Record<string, unknown>) as T
      } catch {
        // 正常系優先のため、ここでのログは省略してスルー
        return result
      }
    }

    return result
  }

  private isPostResponseError(message: string): boolean {
    // 接続系のみ provider 切替対象（post-response ではない）
    if (CONNECTIVITY_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) return false
    if (HTTP_ERROR_PATTERNS.SERVER_ERROR.test(message)) return false

    // JSON/スキーマ関連は「応答後エラー」= provider 切替しない
    if (JSON_SCHEMA_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) return true

    // 4xx はプロンプト/利用側の問題として post-response
    if (HTTP_ERROR_PATTERNS.CLIENT_ERROR.test(message)) return true

    // 既定は post-response（切替しない）
    return true
  }

  private isRetryableJsonError(message: string): boolean {
    // Allow disabling schema-validation retries via env flag while keeping parse/format retries
    const allowSchemaRetry = process.env.APP_LLM_SCHEMA_RETRY_ENABLED !== 'false'
    if (!allowSchemaRetry && message.includes('schema validation failed')) return false
    // Groqの特定のJSONエラーをリトライ対象とする
    return RETRYABLE_JSON_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

let _singleton: DefaultLlmStructuredGenerator | null = null
export function getLlmStructuredGenerator(): DefaultLlmStructuredGenerator {
  if (_singleton) return _singleton
  _singleton = new DefaultLlmStructuredGenerator()
  return _singleton
}
