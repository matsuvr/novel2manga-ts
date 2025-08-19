import type { z } from 'zod'
import { createClientForProvider, selectProviderOrder } from '../agents/llm/router'
import type { LlmClient, LlmProvider } from '../agents/llm/types'
import { getLLMProviderConfig } from '../config/llm.config'

export interface GenerateArgs<T> {
  name?: string
  systemPrompt?: string
  userPrompt: string
  schema: z.ZodType<T>
  schemaName: string
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
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            msg: 'LLM provider switch due to connectivity error',
            service: 'llm-structured-generator',
            name,
            from: provider,
            to: next,
            reason: truncate(reason, 500),
          }),
        )
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
        return await client.generateStructured<T>({
          systemPrompt,
          userPrompt,
          spec: { schema, schemaName },
          options: { maxTokens },
        })
      } catch (error) {
        lastError = error
        const errorMessage = error instanceof Error ? error.message : String(error)

        // JSON生成関連のエラーのみリトライ対象とする
        const isRetryableJsonError = this.isRetryableJsonError(errorMessage)

        if (!isRetryableJsonError || attempt === maxRetries) {
          // リトライ対象外、または最大試行回数に達した場合は即座にエラーを投げる
          throw error
        }

        // リトライ実行をログ出力
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            msg: 'LLM JSON generation failed, retrying',
            service: 'llm-structured-generator',
            name,
            provider: prov,
            attempt,
            maxRetries,
            reason: truncate(errorMessage, 300),
          }),
        )

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

  private isPostResponseError(message: string): boolean {
    const postMarkers = [
      'schema validation failed',
      'does not contain a valid JSON',
      'Unexpected end of JSON input',
      'Failed to parse JSON response',
      'empty or non-text response',
    ]
    const connectivity = [
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'fetch failed',
      'network error',
      'HTTP 5',
      'TLS',
    ]
    const hasMarker = postMarkers.some((m) => message.includes(m))
    const hasConnectivity = connectivity.some((m) => message.includes(m))
    if (hasMarker) return true
    if (/HTTP\s+4\d{2}/.test(message)) return true
    if (hasConnectivity) return false
    return true
  }

  private isRetryableJsonError(message: string): boolean {
    // Groqの特定のJSONエラーをリトライ対象とする
    const retryableErrors = [
      'json_validate_failed',
      'Failed to generate JSON',
      'JSON parse failed',
      'Unexpected end of JSON input',
      'does not contain a valid JSON',
    ]
    return retryableErrors.some((error) => message.includes(error))
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
