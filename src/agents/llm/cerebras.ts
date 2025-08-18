import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { z } from 'zod'
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
  private zodToJsonSchema(schema: z.ZodTypeAny, _name?: string): Record<string, unknown> {
    // Convert common Zod types to JSON Schema
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape
      const properties: Record<string, Record<string, unknown>> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodTypeAny)

        // Check if field is required (not optional)
        if (!(value as z.ZodTypeAny).isOptional?.()) {
          required.push(key)
        }
      }

      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      }
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
      }
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string' }
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number' }
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' }
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options,
      }
    }

    if (schema instanceof z.ZodUnion) {
      return {
        anyOf: schema.options.map((option: z.ZodTypeAny) => this.zodToJsonSchema(option)),
      }
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap())
    }

    if (schema instanceof z.ZodEffects) {
      // For transforms and other effects, use the input schema
      return this.zodToJsonSchema(schema.innerType())
    }

    // Fallback for unknown types
    return { type: 'object' }
  }

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
    const jsonSchema = this.zodToJsonSchema(spec.schema, spec.schemaName)

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
