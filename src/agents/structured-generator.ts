import type { z } from 'zod'
import { createClientForProvider, selectProviderOrder } from '@/agents/llm/router'
import type { LlmClient, LlmProvider } from '@/agents/llm/types'
import {
  CONNECTIVITY_ERROR_PATTERNS,
  HTTP_ERROR_PATTERNS,
  JSON_SCHEMA_ERROR_PATTERNS,
  RETRYABLE_JSON_ERROR_PATTERNS,
} from '@/errors/error-patterns'
import { normalizeLLMResponse } from '@/utils/dialogue-normalizer'
import { getLLMProviderConfig } from '../config/llm.config'

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
        const { getLogger } = await import('@/infrastructure/logging/logger')
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

    const maxRetries = 3
    let lastError: unknown

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await client.generateStructured<T>({
          systemPrompt,
          userPrompt,
          spec: { schema, schemaName },
          options: { maxTokens },
          telemetry: {
            ...args.telemetry,
            // 名前をエージェント名として渡す（渡されていなければこのnameを使う）
            agentName: args.telemetry?.agentName || args.name || 'llm-structured-generator',
          },
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
          const { getLogger } = await import('@/infrastructure/logging/logger')
          getLogger()
            .withContext({ service: 'llm-structured-generator', name })
            .error('Dialogue schema validation failed - invalid dialogue format', {
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
        const { getLogger } = await import('@/infrastructure/logging/logger')
        getLogger()
          .withContext({ service: 'llm-structured-generator', name })
          .warn('LLM JSON generation failed, retrying', {
            provider: prov,
            attempt,
            maxRetries,
            reason: truncate(errorMessage, 300),
          })

        // 少し待ってからリトライ（指数バックオフ）
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private createClient(provider: LlmProvider): LlmClient {
    return createClientForProvider(provider)
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
