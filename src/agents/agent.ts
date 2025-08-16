import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getLLMProviderConfig } from '@/config'
import type { LLMProvider } from '@/config/llm.config'
import { AgentError } from './errors'

/**
 * JSON Schema object with possible type arrays that need transformation
 */
interface JsonSchemaNode {
  type?: string | string[]
  anyOf?: JsonSchemaNode[]
  properties?: Record<string, JsonSchemaNode>
  additionalProperties?: boolean
  nullable?: boolean
  minimum?: number
  maximum?: number
  items?: JsonSchemaNode
  prefixItems?: JsonSchemaNode[]
  [key: string]: unknown
}

/**
 * Transforms JSON Schema for Cerebras compatibility.
 * - Converts type arrays like {"type": ["string", "null"]} to {"anyOf": [{"type": "string"}, {"type": "null"}]}
 * - Adds "additionalProperties: false" to all objects for Cerebras requirement
 * - Removes unsupported "nullable" fields and converts to anyOf patterns
 * - Removes unsupported "minimum" and "maximum" fields
 * - Ensures arrays have required "items" property
 * - Handles nullable arrays by converting to anyOf patterns
 */
function transformForCerebrasCompatibility(
  schema: JsonSchemaNode | undefined,
  visited = new WeakSet(),
): JsonSchemaNode | undefined {
  if (!schema || typeof schema !== 'object' || schema === null) {
    return schema
  }

  // Prevent infinite recursion
  if (visited.has(schema)) {
    return schema
  }
  visited.add(schema)

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      transformForCerebrasCompatibility(item as JsonSchemaNode, visited),
    ) as unknown as JsonSchemaNode
  }

  const result = { ...schema } as JsonSchemaNode

  // 1. Type arrays を anyOf に変換
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[]
    delete result.type
    result.anyOf = types.map((type: string) => ({ type }))
  }

  // 2. Nullable arrays を処理
  if (result.nullable === true && result.type === 'array') {
    delete result.nullable
    delete result.type
    const arraySchema = { type: 'array', items: result.items || {} }
    result.anyOf = [arraySchema, { type: 'null' }]
    delete result.items
  }
  // 3. その他の nullable フィールドを処理
  else if (result.nullable === true && result.type && typeof result.type === 'string') {
    const originalType = result.type
    delete result.type
    delete result.nullable
    result.anyOf = [{ type: originalType }, { type: 'null' }]
  } else if (result.nullable === true) {
    delete result.nullable
  }

  // 4. additionalProperties を追加
  if (result.type === 'object' || result.properties) {
    result.additionalProperties = false
  }

  // 5. サポートされていないフィールドを削除
  delete result.minimum
  delete result.maximum

  // 6. Array の items を保証
  if (result.type === 'array' && !result.items && !result.prefixItems) {
    result.items = {}
  }

  // 7. 再帰的に処理（循環参照を防ぐためvisitedを渡す）
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          transformForCerebrasCompatibility(item as JsonSchemaNode, visited),
        )
      } else {
        result[key] = transformForCerebrasCompatibility(value as JsonSchemaNode, visited)
      }
    }
  }

  // 8. anyOfの循環参照を防ぐ特別な処理
  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((item, _index) => {
      // 既に処理済みの場合はそのまま返す
      if (visited.has(item)) {
        return item
      }
      const transformed = transformForCerebrasCompatibility(item as JsonSchemaNode, visited)
      return transformed || { type: 'string' }
    })
  }

  // Final step: Handle empty objects that Cerebras cannot process
  // This must be done AFTER recursive processing to catch all cases
  const finalResult = handleEmptyObjectsForCerebras(result, visited)

  return finalResult
}

/**
 * Final cleanup step to handle empty objects that Cerebras cannot process
 */
function handleEmptyObjectsForCerebras(
  schema: JsonSchemaNode,
  visited: WeakSet<object>,
): JsonSchemaNode {
  if (!schema || typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return schema
  }

  // Prevent infinite recursion
  if (visited.has(schema)) {
    return schema
  }
  visited.add(schema)

  const result = { ...schema }

  // Check if this is an empty object
  const isEmpty = Object.keys(result).length === 0
  if (isEmpty) {
    // Return a minimal valid schema instead of empty object
    return { type: 'string' }
  }

  // Replace empty object values with minimal valid schemas
  for (const [key, value] of Object.entries(result)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      result[key] = { type: 'string' }
    } else if (value && typeof value === 'object') {
      result[key] = handleEmptyObjectsForCerebras(value as JsonSchemaNode, visited)
    }
  }

  return result
}

export interface AgentOptions {
  name: string
  instructions: string
  provider: LLMProvider
  model?: string
  maxTokens?: number
}

export interface GenerateOptions {
  maxRetries?: number
  jobId?: string // トークン使用量記録用
  stepName?: string // ステップ名（analyze, layout, etc.）
  chunkIndex?: number // チャンク分析の場合
  episodeNumber?: number // エピソード処理の場合
}

export class Agent {
  private name: string
  private instructions: string
  private provider: LLMProvider
  private model: string
  private maxTokens: number
  private client: OpenAI | GoogleGenAI | Cerebras | null = null
  private _debugLogCount = 0

  constructor(options: AgentOptions) {
    this.name = options.name
    this.instructions = options.instructions
    this.provider = options.provider

    const config = getLLMProviderConfig(options.provider)
    this.model = options.model || config.model
    this.maxTokens = options.maxTokens || config.maxTokens

    this.initializeClient()
  }

  private initializeClient() {
    const config = getLLMProviderConfig(this.provider)

    if (!config.apiKey) {
      throw new Error(`API key not found for provider: ${this.provider}`)
    }

    switch (this.provider) {
      case 'cerebras':
        this.client = new Cerebras({
          apiKey: config.apiKey,
        })
        break
      case 'openai':
        this.client = new OpenAI({
          apiKey: config.apiKey,
        })
        break

      case 'gemini':
        this.client = new GoogleGenAI({
          apiKey: config.apiKey,
        })
        break

      case 'groq':
        this.client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: 'https://api.groq.com/openai/v1',
        })
        break

      case 'openrouter':
        this.client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
        })
        break

      default:
        throw new Error(`Unknown provider: ${this.provider}`)
    }
  }

  async generateObject<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
    options?: GenerateOptions,
  ): Promise<z.infer<T>> {
    // Test-mode short-circuit to avoid real LLM calls. Allowed for LLM only.
    if (process.env.NODE_ENV === 'test') {
      // In integration tests, never call real LLM for layout steps.
      const step = options?.stepName
      if (step === 'layout' || step === 'layout-plan') {
        const stub = {
          pages: [
            { pageNumber: 1, panelCount: 1 },
            { pageNumber: 2, panelCount: 6 },
          ],
        } as unknown as z.infer<T>
        return stub
      }
      // Also short-circuit page-split planning
      if (step === 'page-split') {
        const episodeNumber = options?.episodeNumber ?? 1
        const stubPlan = {
          episodeNumber,
          startPage: 1,
          plannedPages: [
            {
              pageNumber: 1,
              summary: 'impact',
              importance: 9,
              segments: [
                {
                  contentHint: 'impact',
                  importance: 9,
                  source: { chunkIndex: 0, startOffset: 0, endOffset: 10 },
                },
              ],
            },
            {
              pageNumber: 2,
              summary: 'dialogue',
              importance: 3,
              segments: [
                {
                  contentHint: 'talk',
                  importance: 3,
                  source: { chunkIndex: 0, startOffset: 10, endOffset: 20 },
                },
              ],
            },
          ],
          mayAdjustPreviousPages: false,
          remainingPagesEstimate: 0,
        } as unknown as z.infer<T>
        return stubPlan
      }
    }

    const maxRetries = options?.maxRetries ?? 0

    // Add system prompt as first message
    const allMessages = [{ role: 'system' as const, content: this.instructions }, ...messages]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let result: z.infer<T>
        let tokenUsage: {
          promptTokens: number
          completionTokens: number
          totalTokens: number
        } | null = null

        if (this.provider === 'gemini' && this.client instanceof GoogleGenAI) {
          const response = await this.generateWithGemini(allMessages, schema)
          result = response.result
          tokenUsage = response.tokenUsage
        } else if (this.client instanceof OpenAI) {
          const response = await this.generateWithOpenAI(allMessages, schema)
          result = response.result
          tokenUsage = response.tokenUsage
        } else if (this.client instanceof Cerebras) {
          const response = await this.generateWithCerebras(allMessages, schema)
          result = response.result
          tokenUsage = response.tokenUsage
        } else {
          throw new Error('Invalid client type')
        }

        // トークン使用量を記録
        if (tokenUsage && options?.jobId) {
          await this.recordTokenUsage(tokenUsage, options)
        }

        return result
      } catch (error) {
        if (attempt < maxRetries) {
          continue
        }
        throw error
      }
    }

    throw new Error('Max retries exceeded')
  }

  private async generateWithOpenAI<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
  ): Promise<{
    result: z.infer<T>
    tokenUsage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    } | null
  }> {
    const client = this.client as OpenAI

    // Use structured outputs with response_format
    const responseFormat = zodResponseFormat(schema, 'response')

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        max_tokens: this.maxTokens,
        // For OpenAI-compatible SDKs
        response_format: responseFormat as ChatCompletionCreateParams['response_format'],
      })
      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw AgentError.fromProviderError(new Error('No content in response'), 'openai')
      }

      try {
        const parsed = JSON.parse(content)
        try {
          const result = schema.parse(parsed)
          const tokenUsage = completion.usage
            ? {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens,
              }
            : null
          return { result, tokenUsage }
        } catch (schemaError) {
          throw AgentError.fromSchemaValidationError(schemaError, 'openai')
        }
      } catch (jsonError) {
        throw AgentError.fromJsonParseError(jsonError, 'openai')
      }
    } catch (error) {
      if (error instanceof AgentError) {
        throw error
      }
      throw AgentError.fromProviderError(error, 'openai')
    }
  }

  private async generateWithCerebras<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
  ): Promise<{
    result: z.infer<T>
    tokenUsage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    } | null
  }> {
    const client = this.client as Cerebras

    // Convert Zod schema to JSON Schema using proper library
    // Use $defs instead of definitions and force anyOf for Cerebras compatibility
    const jsonSchema = zodToJsonSchema(schema, {
      name: 'response_schema',
      definitionPath: '$defs',
      strictUnions: true,
      target: 'openApi3', // Use OpenAPI3 target to force anyOf for unions and nullable
      removeAdditionalStrategy: 'strict',
      // Post-process to ensure Cerebras compatibility (no type arrays, additionalProperties: false)
      postProcess: (schema) => {
        const transformed = transformForCerebrasCompatibility(schema as JsonSchemaNode)
        if (process.env.DEBUG_CEREBRAS_SCHEMA === 'true') {
          // Only log a few times per process
          if (!this._debugLogCount) this._debugLogCount = 0
          if (this._debugLogCount < 5) {
            console.log(
              `[Cerebras Schema Debug] Agent: ${this.name}, Final schema:`,
              JSON.stringify(transformed, null, 2),
            )
            this._debugLogCount++
          }
        }
        return transformed as typeof schema
      },
    })

    try {
      // Use Cerebras structured outputs with json_schema format
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: this.maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response_schema',
            strict: true,
            schema: jsonSchema,
          },
        },
      })

      const chatCompletionSchema = z.object({
        choices: z
          .array(
            z.object({
              message: z.object({ content: z.string() }),
            }),
          )
          .min(1),
        usage: z
          .object({
            prompt_tokens: z.number(),
            completion_tokens: z.number(),
            total_tokens: z.number(),
          })
          .optional(),
      })
      const parsedCompletion = chatCompletionSchema.parse(completion)
      let content = parsedCompletion.choices[0].message.content

      // Clean up any markdown formatting
      content = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      // Try to parse JSON with better error handling
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch (jsonError) {
        console.error('[Cerebras] Invalid JSON response content:', content.substring(0, 200))
        throw AgentError.fromJsonParseError(jsonError, 'cerebras')
      }

      try {
        const result = schema.parse(parsed)
        const tokenUsage = parsedCompletion.usage
          ? {
              promptTokens: parsedCompletion.usage.prompt_tokens,
              completionTokens: parsedCompletion.usage.completion_tokens,
              totalTokens: parsedCompletion.usage.total_tokens,
            }
          : null
        return { result, tokenUsage }
      } catch (schemaError) {
        throw AgentError.fromSchemaValidationError(schemaError, 'cerebras')
      }
    } catch (err) {
      // Re-throw AgentErrors as-is, wrap others
      if (err instanceof AgentError) {
        throw err
      }
      console.error('[Cerebras] Error in generateWithCerebras:', err)
      throw AgentError.fromProviderError(err, 'cerebras')
    }
  }

  private async generateWithGemini<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
  ): Promise<{
    result: z.infer<T>
    tokenUsage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    } | null
  }> {
    const client = this.client as GoogleGenAI

    // Build role-preserving contents for Gemini
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    // Convert Zod schema to JSON Schema for Gemini
    // Use $defs instead of definitions for better compatibility
    const jsonSchema = zodToJsonSchema(schema, {
      name: 'response_schema',
      definitionPath: '$defs',
      strictUnions: true,
      target: 'openApi3',
      removeAdditionalStrategy: 'strict',
      postProcess: (schema) => {
        return transformForCerebrasCompatibility(schema as JsonSchemaNode) as typeof schema
      },
    })

    // Include schema requirement as a final instruction to the model
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Respond ONLY with a JSON object that matches this schema:\n${JSON.stringify(
            jsonSchema,
            null,
            2,
          )}\n\nDo NOT wrap your response in markdown code blocks. Return only the raw JSON.`,
        },
      ],
    })

    const response = await client.models.generateContent({
      model: this.model,
      contents,
    })

    let text = response.text
    if (!text) {
      throw AgentError.fromProviderError(new Error('Empty response from Gemini'), 'gemini')
    }

    // Clean up markdown code blocks if present
    text = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    try {
      const parsed = JSON.parse(text)
      try {
        const result = schema.parse(parsed)
        // Gemini API doesn't provide token usage in the same way
        const tokenUsage = null
        return { result, tokenUsage }
      } catch (schemaError) {
        throw AgentError.fromSchemaValidationError(schemaError, 'gemini')
      }
    } catch (error) {
      if (error instanceof AgentError) {
        throw error
      }
      console.error('Failed to parse Gemini response:', text)
      throw AgentError.fromJsonParseError(error, 'gemini')
    }
  }

  async generate(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    options?: GenerateOptions,
  ): Promise<string> {
    const maxRetries = options?.maxRetries ?? 0

    const allMessages = [{ role: 'system' as const, content: this.instructions }, ...messages]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (this.provider === 'gemini' && this.client instanceof GoogleGenAI) {
          const contents = allMessages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))

          const response = await this.client.models.generateContent({
            model: this.model,
            contents,
          })

          return response.text || ''
        } else if (this.client instanceof OpenAI) {
          const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: allMessages as OpenAI.ChatCompletionMessageParam[],
            max_tokens: this.maxTokens,
          })

          return completion.choices[0]?.message?.content || ''
        } else if (this.client instanceof Cerebras) {
          const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: allMessages,
            max_tokens: this.maxTokens,
          })

          const chatCompletionSchema = z.object({
            choices: z
              .array(
                z.object({
                  message: z.object({ content: z.string() }),
                }),
              )
              .min(1),
          })
          const parsedCompletion = chatCompletionSchema.parse(completion)
          return parsedCompletion.choices[0].message.content
        }
        throw new Error('Invalid client type')
      } catch (error) {
        if (attempt < maxRetries) {
          continue
        }
        throw error
      }
    }

    throw new Error('Max retries exceeded')
  }

  private async recordTokenUsage(
    tokenUsage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    },
    options: GenerateOptions,
  ): Promise<void> {
    if (!options.jobId) return

    try {
      // 概算コストを計算（プロバイダー別）
      const cost = this.calculateCost(tokenUsage, this.provider)

      const tokenUsageData = {
        id: crypto.randomUUID(),
        jobId: options.jobId,
        agentName: this.name,
        provider: this.provider,
        model: this.model,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        cost,
        stepName: options.stepName,
        chunkIndex: options.chunkIndex,
        episodeNumber: options.episodeNumber,
      }

      // データベースに記録（非同期で実行、エラーは無視）
      this.saveTokenUsageToDatabase(tokenUsageData).catch((error) => {
        console.warn(`[${this.name}] Failed to save token usage:`, error)
      })
    } catch (error) {
      console.warn(`[${this.name}] Failed to record token usage:`, error)
    }
  }

  private calculateCost(
    tokenUsage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    },
    provider: LLMProvider,
  ): number {
    // 概算コスト（USD per 1K tokens）
    const rates: Record<LLMProvider, { input: number; output: number }> = {
      cerebras: { input: 0.0001, output: 0.0002 }, // 概算
      openai: { input: 0.0005, output: 0.0015 }, // GPT-4o mini
      gemini: { input: 0.000125, output: 0.000375 }, // Gemini 2.0 Flash
      groq: { input: 0.0001, output: 0.0002 }, // 概算
      openrouter: { input: 0.0001, output: 0.0002 }, // 概算
    }

    const rate = rates[provider] || rates.cerebras
    const inputCost = (tokenUsage.promptTokens / 1000) * rate.input
    const outputCost = (tokenUsage.completionTokens / 1000) * rate.output

    return Math.round((inputCost + outputCost) * 1000000) / 1000000 // 6桁まで
  }

  private async saveTokenUsageToDatabase(tokenUsageData: {
    id: string
    jobId: string
    agentName: string
    provider: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost?: number
    stepName?: string
    chunkIndex?: number
    episodeNumber?: number
  }): Promise<void> {
    try {
      // データベースサービスを動的インポート
      const { getDatabaseService } = await import('@/services/db-factory')
      const dbService = getDatabaseService()

      // DatabaseServiceのrecordTokenUsageメソッドを使用
      await dbService.recordTokenUsage(tokenUsageData)
    } catch (error) {
      console.warn(`[${this.name}] Failed to save token usage to database:`, error)
    }
  }
}
