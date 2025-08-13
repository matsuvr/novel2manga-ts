import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { z } from 'zod'
import { getLLMProviderConfig } from '@/config'
import type { LLMProvider } from '@/config/llm.config'

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
  private client: OpenAI | GoogleGenAI | null = null

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

      case 'claude':
        this.client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: 'https://api.anthropic.com/v1',
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
    const completion = await client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: this.maxTokens,
      response_format: zodResponseFormat(schema, 'response'),
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in response')
    }

    const parsed = JSON.parse(content)
    return schema.parse(parsed)
  }

  private async generateWithGemini<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
  ): Promise<z.infer<T>> {
    const client = this.client as GoogleGenAI

    // Combine system and user messages for Gemini
    const prompt = messages
      .map((m) => {
        const prefix =
          m.role === 'system' ? 'System: ' : m.role === 'assistant' ? 'Assistant: ' : 'User: '
        return prefix + m.content
      })
      .join('\n\n')

    // Convert Zod schema to JSON Schema for Gemini
    const jsonSchema = this.zodToJsonSchema(schema)

    // Add schema instruction to prompt
    const schemaInstruction = `\n\nRespond with a valid JSON object that matches this schema:\n${JSON.stringify(jsonSchema, null, 2)}`

    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt + schemaInstruction,
    })

    const text = response.text
    if (!text) {
      throw new Error('Empty response from Gemini')
    }

    try {
      const parsed = JSON.parse(text)
      return schema.parse(parsed)
    } catch (error) {
      console.error('Failed to parse Gemini response:', text)
      throw error
    }
  }

  private zodToJsonSchema(schema: z.ZodTypeAny): any {
    // Simple Zod to JSON Schema converter
    // For production, consider using zod-to-json-schema library
    const def = schema._def

    if (def.typeName === 'ZodObject') {
      const shape = def.shape()
      const properties: any = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodTypeAny)
        if (!(value as any).isOptional()) {
          required.push(key)
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
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
        items: this.zodToJsonSchema(def.type),
      }
    } else if (def.typeName === 'ZodEnum') {
      return {
        type: 'string',
        enum: def.values,
      }
    } else if (def.typeName === 'ZodOptional') {
      return this.zodToJsonSchema(def.innerType)
    } else if (def.typeName === 'ZodNullable') {
      const innerSchema = this.zodToJsonSchema(def.innerType)
      return {
        ...innerSchema,
        nullable: true,
      }
    } else if (def.typeName === 'ZodUnion') {
      return {
        oneOf: def.options.map((opt: z.ZodTypeAny) => this.zodToJsonSchema(opt)),
      }
    } else {
      // Fallback for unsupported types
      return { type: 'any' }
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
          const prompt = allMessages
            .map((m) => {
              const prefix =
                m.role === 'system' ? 'System: ' : m.role === 'assistant' ? 'Assistant: ' : 'User: '
              return prefix + m.content
            })
            .join('\n\n')

          const response = await this.client.models.generateContent({
            model: this.model,
            contents: prompt,
          })

          return response.text || ''
        } else if (this.client instanceof OpenAI) {
          const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: allMessages as OpenAI.ChatCompletionMessageParam[],
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
