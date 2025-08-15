import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { GoogleGenAI } from '@google/genai'
import Groq from 'groq-sdk'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions'
import { z } from 'zod'
import { getLLMProviderConfig } from '@/config'
import type { LLMProvider } from '@/config/llm.config'
import { AgentError } from './errors'

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

type ChatMessage = { role: 'user' | 'system' | 'assistant'; content: string }

interface OpenAICompletion {
  choices: Array<{ message?: { content?: string | null } }>
}

interface OpenAICompatibleClient {
  chat: {
    completions: {
      create(params: {
        model: string
        messages: ChatMessage[]
        max_tokens: number
        response_format?: unknown
      }): Promise<OpenAICompletion>
    }
  }
}

export class Agent {
  private name: string
  private instructions: string
  private provider: LLMProvider
  private model: string
  private maxTokens: number
  private client: OpenAICompatibleClient | GoogleGenAI | null = null

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
        }) as OpenAICompatibleClient
        break

      case 'gemini':
        this.client = new GoogleGenAI({
          apiKey: config.apiKey,
        })
        break

      case 'groq':
        this.client = new Groq({
          apiKey: config.apiKey,
        }) as OpenAICompatibleClient
        break

      case 'openrouter':
        this.client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
        }) as OpenAICompatibleClient
        break

      default:
        throw new Error(`Unknown provider: ${this.provider}`)
    }
  }

  async generateObject<T extends z.ZodTypeAny>(
    messages: ChatMessage[],
    schema: T,
    options?: GenerateOptions,
  ): Promise<z.infer<T>> {
    const maxRetries = options?.maxRetries ?? 2

    // Add system prompt as first message
    const allMessages: ChatMessage[] = [{ role: 'system', content: this.instructions }, ...messages]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (this.provider === 'gemini' && this.client instanceof GoogleGenAI) {
          return await this.generateWithGemini(allMessages, schema)
        }
        if (this.client) {
          return await this.generateWithOpenAICompatible(allMessages, schema)
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

  private async generateWithOpenAICompatible<T extends z.ZodTypeAny>(
    messages: ChatMessage[],
    schema: T,
  ): Promise<z.infer<T>> {
    const client = this.client as OpenAICompatibleClient

    // Use structured outputs with response_format
    const completion = await client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      response_format: zodResponseFormat(schema, 'response'),
    })


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
    try {
      // First try: strict structured outputs
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: this.zodToJsonSchema(schema),
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
      const content = parsedCompletion.choices[0].message.content

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
    const jsonSchema = this.zodToJsonSchema(schema)

    // Include schema requirement as a final instruction to the model
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Respond ONLY with a JSON object that matches this schema:\n${JSON.stringify(
            jsonSchema,
            null,
            2,
          )}`,
        },
      ],
    })

    const response = await client.models.generateContent({
      model: this.model,
      contents,
    })

    const text = response.text
    if (!text) {
      throw AgentError.fromProviderError(new Error('Empty response from Gemini'), 'gemini')
    }

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

  private zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    // Simple Zod to JSON Schema converter
    // For production, consider using zod-to-json-schema library
    const def = schema._def

    if (def.typeName === 'ZodObject') {
      const shape = def.shape()
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        const valueSchema = value as z.ZodTypeAny
        properties[key] = this.zodToJsonSchema(valueSchema)
        const valueDef = (valueSchema as z.ZodTypeAny)._def
        const isOptional = valueDef?.typeName === 'ZodOptional'
        if (!isOptional) required.push(key)
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        // Cerebras strict mode requires additionalProperties: false when required is present
        additionalProperties: false,
      }
    } else if (def.typeName === 'ZodString') {
      return { type: 'string' }
    } else if (def.typeName === 'ZodNumber') {
      return { type: 'number' }
    } else if (def.typeName === 'ZodBoolean') {
      return { type: 'boolean' }
    } else if (def.typeName === 'ZodArray') {
      return {
        type: 'array',
        items: this.zodToJsonSchema(def.type as z.ZodTypeAny),
      }
    } else if (def.typeName === 'ZodEnum') {
      return {
        type: 'string',
        enum: def.values as string[],
      }
    } else if (def.typeName === 'ZodOptional') {
      return this.zodToJsonSchema(def.innerType as z.ZodTypeAny)
    } else if (def.typeName === 'ZodNullable') {
      const innerSchema = this.zodToJsonSchema(def.innerType as z.ZodTypeAny)
      return {
        ...innerSchema,
        nullable: true,
      }
    } else if (def.typeName === 'ZodUnion') {
      return {
        anyOf: (def.options as z.ZodTypeAny[]).map((opt) => this.zodToJsonSchema(opt)),
      }
    } else {
      // Fallback for unsupported types
      return {}
    }
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const maxRetries = options?.maxRetries ?? 2

    const allMessages: ChatMessage[] = [{ role: 'system', content: this.instructions }, ...messages]

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
        }

        if (this.client) {
          const completion = await (this.client as OpenAICompatibleClient).chat.completions.create({
            model: this.model,
            messages: allMessages,
            max_tokens: this.maxTokens,
          })

          return completion.choices[0]?.message?.content || ''
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
