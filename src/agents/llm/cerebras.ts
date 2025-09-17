import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getLogger } from '@/infrastructure/logging/logger'
import {
  type JsonSchemaNode,
  transformForCerebrasCompatibility,
  validateCerebrasSchema,
} from '../../llm/providers/cerebras-utils'
import type { GenerateStructuredParams, LlmClient } from './types'

export interface CerebrasClientConfig {
  apiKey: string
  model: string
}

export class CerebrasClient implements LlmClient {
  readonly provider = 'cerebras' as const
  private readonly client: Cerebras
  private readonly model: string

  constructor(cfg: CerebrasClientConfig) {
    this.client = new Cerebras({
      apiKey: cfg.apiKey,
    })
    this.model = cfg.model
  }
  // Use zod-to-json-schema for accurate JSON Schema generation.
  // Note: If environment constraints ever forbid this dep (e.g. Workers size),
  // we must document a reduced custom converter's limitations (descriptions, refinements, etc.).

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    spec,
    options,
  }: GenerateStructuredParams<T>): Promise<T> {
    if (typeof userPrompt !== 'string') {
      throw new Error('cerebras: invalid argument userPrompt (string required)')
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = []

    if (systemPrompt?.trim()) {
      messages.push({
        role: 'system',
        content: systemPrompt.trim(),
      })
    }

    messages.push({
      role: 'user',
      content: userPrompt.trim(),
    })

    // Convert Zod schema to JSON Schema for structured outputs
    // Cerebras要件に合わせて `$defs` を使用し、互換変換を適用
    const jsonSchemaRaw = zodToJsonSchema(spec.schema, {
      name: spec.schemaName || 'response',
      definitionPath: '$defs',
    }) as Record<string, unknown>
    const jsonSchema = transformForCerebrasCompatibility(
      jsonSchemaRaw as unknown as Record<string, unknown>,
    ) as Record<string, unknown>
    const validationErrors = validateCerebrasSchema(jsonSchema as JsonSchemaNode)
    if (validationErrors.length > 0) {
      throw new Error(`cerebras: schema incompatible: ${validationErrors.join('; ')}`)
    }

    try {
      let completion: unknown
      try {
        completion = await this.client.chat.completions.create({
          model: this.model,
          messages,
          max_tokens: options.maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: spec.schemaName || 'response',
              strict: true,
              schema: jsonSchema,
            },
          },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Structured output state machine の更新タイムアウトなど 4xx エラー時は JSON モードへフォールバック
        if (
          /Timed out while updating the structured output state machine/i.test(msg) ||
          /BadRequest|HTTP\s*400/.test(msg)
        ) {
          // UI方針: フォールバックは必ず明示。ここではログで通知し、上位のUI連携は別チケットで追加する。
          getLogger()
            .withContext({ service: 'llm-cerebras' })
            .warn('structured_output_fallback_to_json_object', { error: msg })
          const jsonMode = await this.client.chat.completions.create({
            model: this.model,
            messages,
            max_tokens: options.maxTokens,
            response_format: { type: 'json_object' },
          })
          completion = jsonMode
        } else {
          throw e
        }
      }

      // Type safety: ensure choices exists and has elements
      type ChoicesLike = Array<{ message?: { content?: string | null } }>
      const choices = (completion as unknown as { choices?: ChoicesLike | null | undefined })
        ?.choices
      if (!Array.isArray(choices) || choices.length === 0) {
        throw new Error('cerebras: no choices in response')
      }

      const choice = choices[0]
      const contentRaw = choice?.message?.content
      if (typeof contentRaw !== 'string' || !contentRaw) {
        throw new Error('cerebras: empty or non-text response')
      }
      const content = contentRaw as string

      try {
        const parsed = JSON.parse(content)
        try {
          return spec.schema.parse(parsed)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          throw new Error(
            `cerebras: schema validation failed: ${msg}. Raw: ${truncate(content, 400)}`,
          )
        }
      } catch (jsonError) {
        // JSON パースエラー時に詳細なエラー情報をログ出力
        const errorMsg = jsonError instanceof Error ? jsonError.message : String(jsonError)
        getLogger()
          .withContext({ service: 'llm-cerebras', operation: 'JSON.parse', model: this.model })
          .error('json_parse_error', {
            error: errorMsg,
            rawContentPreview: truncate(content, 500),
            contentLength: content.length,
          })
        throw new Error(
          `cerebras: JSON parse failed: ${errorMsg}. Content preview: ${truncate(content, 200)}`,
        )
      }
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`cerebras: ${e.message}`)
      }
      throw new Error(`cerebras: ${String(e)}`)
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
