import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { zodToJsonSchema } from 'zod-to-json-schema'
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
    const jsonSchema = zodToJsonSchema(spec.schema, { name: spec.schemaName || 'response' })

    try {
      const chatCompletion = await this.client.chat.completions.create({
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

      // Type safety: ensure choices exists and has elements
      if (
        !chatCompletion.choices ||
        !Array.isArray(chatCompletion.choices) ||
        chatCompletion.choices.length === 0
      ) {
        throw new Error('cerebras: no choices in response')
      }

      const choice = chatCompletion.choices[0]
      if (!choice?.message?.content) {
        throw new Error('cerebras: empty or non-text response')
      }
      const content = choice.message.content

      const parsed = JSON.parse(content)
      try {
        return spec.schema.parse(parsed)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(
          `cerebras: schema validation failed: ${msg}. Raw: ${truncate(content, 400)}`,
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
