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
): JsonSchemaNode | undefined {
  if (!schema || typeof schema !== 'object' || schema === null) {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      transformForCerebrasCompatibility(item as JsonSchemaNode),
    ) as unknown as JsonSchemaNode
  }

  const result = { ...schema } as JsonSchemaNode

  // Handle type arrays - convert to anyOf
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[]
    delete result.type
    result.anyOf = types.map((type: string) => ({ type }))
  }

  // Handle nullable arrays first - convert to anyOf pattern for better compatibility
  if (result.nullable === true && result.type === 'array') {
    delete result.nullable
    delete result.type
    const arraySchema = { type: 'array', items: result.items || {} }
    result.anyOf = [arraySchema, { type: 'null' }]
    delete result.items
  }
  // Handle other nullable fields - convert to anyOf pattern
  else if (result.nullable === true && result.type && typeof result.type === 'string') {
    const originalType = result.type
    delete result.type
    delete result.nullable
    result.anyOf = [{ type: originalType }, { type: 'null' }]
  } else if (result.nullable === true) {
    // If nullable but no type, just remove nullable
    delete result.nullable
  }

  // Add additionalProperties: false to all objects for Cerebras compatibility
  if (result.type === 'object' || result.properties) {
    result.additionalProperties = false
  }

  // Remove unsupported minimum and maximum fields
  delete result.minimum
  delete result.maximum

  // Ensure arrays have required items property for Cerebras compatibility
  if (result.type === 'array' && !result.items && !result.prefixItems) {
    // Add a generic items schema if none exists
    result.items = {}
  }

  // Recursively process all properties
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) => transformForCerebrasCompatibility(item as JsonSchemaNode))
      } else {
        result[key] = transformForCerebrasCompatibility(value as JsonSchemaNode)
      }
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
}

export class Agent {
  private name: string
  private instructions: string
  private provider: LLMProvider
  private model: string
  private maxTokens: number
  private client: OpenAI | GoogleGenAI | Cerebras | null = null

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
    const maxRetries = options?.maxRetries ?? 2

    // Add system prompt as first message
    const allMessages = [{ role: 'system' as const, content: this.instructions }, ...messages]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (this.provider === 'gemini' && this.client instanceof GoogleGenAI) {
          return await this.generateWithGemini(allMessages, schema)
        } else if (this.client instanceof OpenAI) {
          return await this.generateWithOpenAI(allMessages, schema)
        } else if (this.client instanceof Cerebras) {
          return await this.generateWithCerebras(allMessages, schema)
        }
        throw new Error('Invalid client type')
      } catch (error) {
        if (attempt === maxRetries) {
          throw error
        }
        console.warn(`[${this.name}] Attempt ${attempt + 1} failed, retrying...`, error)
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000))
      }
    }

    throw new Error('Max retries exceeded')
  }

  private async generateWithOpenAI<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
  ): Promise<z.infer<T>> {
    const client = this.client as OpenAI

    // Use structured outputs with response_format
    const responseFormat = zodResponseFormat(schema, 'response')

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        max_completion_tokens: this.maxTokens,
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
          return schema.parse(parsed)
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
  ): Promise<z.infer<T>> {
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
        return transformForCerebrasCompatibility(schema as JsonSchemaNode) as typeof schema
      },
    })

    try {
      // Use Cerebras structured outputs with json_schema format
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_completion_tokens: this.maxTokens,
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
        return schema.parse(parsed)
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
  ): Promise<z.infer<T>> {
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
        return schema.parse(parsed)
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
    const maxRetries = options?.maxRetries ?? 2

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
            max_completion_tokens: this.maxTokens,
          })

          return completion.choices[0]?.message?.content || ''
        } else if (this.client instanceof Cerebras) {
          const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: allMessages,
            max_completion_tokens: this.maxTokens,
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
        if (attempt === maxRetries) {
          throw error
        }
        console.warn(`[${this.name}] Attempt ${attempt + 1} failed, retrying...`, error)
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000))
      }
    }

    throw new Error('Max retries exceeded')
  }
}
