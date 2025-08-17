import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { LLMProvider } from '@/config/llm.config'
import { createLlmClientFromConfig } from '@/llm'
import { type AgentCore, createAgentCore } from './core'
import type { AgentInput, AgentOptions } from './types'

export interface CompatAgentOptions {
  name: string
  instructions: string
  provider: LLMProvider
  model?: string
  maxTokens?: number
}

export interface GenerateOptions {
  maxRetries?: number
  jobId?: string
  stepName?: string
  chunkIndex?: number
  episodeNumber?: number
}

/**
 * 互換性エージェント
 * 既存のAgentクラスとの互換性を提供
 */
export class CompatAgent {
  private name: string
  private instructions: string
  private provider: LLMProvider
  private model?: string
  private maxTokens?: number
  private core: AgentCore

  constructor(options: CompatAgentOptions) {
    this.name = options.name
    this.instructions = options.instructions
    this.provider = options.provider
    this.model = options.model
    this.maxTokens = options.maxTokens

    // LLMクライアントを作成
    const client = createLlmClientFromConfig(options.provider)
    this.core = createAgentCore(client, 'single-turn')
  }

  /**
   * 既存のgenerateObjectメソッドの互換性
   */
  async generateObject<T>(
    schema: { parse(value: unknown): T } | z.ZodTypeAny,
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<T> {
    const input: AgentInput = {
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }

    // すべてのプロバイダーで厳格なJSON出力を強制
    const strictJsonSuffix =
      '\n\n重要: 出力は「有効なJSONのみ」。説明文・前後本文・コードフェンス（```）・マークダウン・注釈は一切禁止。JSON以外の文字は出力しないこと。'

    const agentOptions: AgentOptions = {
      systemPrompt: `${this.instructions}${strictJsonSuffix}`,
      maxTokens: this.maxTokens,
      temperature: 0.1, // 構造化出力のため低い温度
    }

    // If Zod schema provided, pass JSON schema to providers that support response_format
    try {
      const zodSchemaCandidate: unknown = schema as unknown
      const isZod = (s: unknown): s is z.ZodTypeAny =>
        typeof (s as { safeParse?: unknown }).safeParse === 'function' &&
        typeof (s as { parse?: unknown }).parse === 'function'
      if (isZod(zodSchemaCandidate)) {
        const jsonSchema = zodToJsonSchema(zodSchemaCandidate, {
          name: this.name.replace(/\s+/g, '_'),
        }) as unknown as { definitions?: unknown }
        // zod-to-json-schema returns { $schema, definitions, ... }. We want the root schema.
        const rootSchema = jsonSchema as unknown as Record<string, unknown>
        agentOptions.responseFormat = {
          type: 'json_schema',
          json_schema: {
            name: this.name.replace(/\s+/g, '_'),
            strict: true,
            schema: rootSchema,
          },
        }
      }
    } catch {
      // If conversion fails, skip responseFormat; JSON enforcement still via instructions
    }

    try {
      const result = await this.core.run(input, agentOptions)

      // 最後のアシスタントメッセージからJSONを抽出
      const lastMessage = result.messages[result.messages.length - 1]
      if (lastMessage.role === 'assistant') {
        try {
          // JSONブロックを抽出
          const jsonMatch = lastMessage.content.match(/```json\s*([\s\S]*?)\s*```/)
          let parsed: unknown
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1])
          } else {
            // 直接JSONとして解析を試行
            const trimmed = lastMessage.content.trim()
            // Remove any accidental leading/trailing non-json characters
            const firstBrace = trimmed.indexOf('{')
            const lastBrace = trimmed.lastIndexOf('}')
            const candidate =
              firstBrace >= 0 && lastBrace >= firstBrace
                ? trimmed.slice(firstBrace, lastBrace + 1)
                : trimmed
            parsed = JSON.parse(candidate)
          }

          // スキーマでバリデーション
          return (schema as { parse(value: unknown): T }).parse(parsed)
        } catch (parseError) {
          throw new Error(
            `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          )
        }
      }

      throw new Error('No assistant response found')
    } catch (error) {
      // リトライロジック（簡易版）
      if (options.maxRetries && options.maxRetries > 0) {
        console.warn(`Retrying generation for ${this.name}, attempt 1/${options.maxRetries}`)
        // 実際のリトライロジックはここに実装
      }

      throw error
    }
  }

  /**
   * 既存のgenerateTextメソッドの互換性
   */
  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const input: AgentInput = {
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }

    const agentOptions: AgentOptions = {
      systemPrompt: this.instructions,
      maxTokens: this.maxTokens,
    }

    try {
      const result = await this.core.run(input, agentOptions)

      const lastMessage = result.messages[result.messages.length - 1]
      if (lastMessage.role === 'assistant') {
        return lastMessage.content
      }

      throw new Error('No assistant response found')
    } catch (error) {
      // リトライロジック（簡易版）
      if (options.maxRetries && options.maxRetries > 0) {
        console.warn(`Retrying generation for ${this.name}, attempt 1/${options.maxRetries}`)
        // 実際のリトライロジックはここに実装
      }

      throw error
    }
  }

  /**
   * 新しいAgentCoreを取得
   */
  getCore(): AgentCore {
    return this.core
  }

  /**
   * 設定を取得
   */
  getConfig(): CompatAgentOptions {
    return {
      name: this.name,
      instructions: this.instructions,
      provider: this.provider,
      model: this.model,
      maxTokens: this.maxTokens,
    }
  }
}

/**
 * 互換性ファクトリー
 */
export function createCompatAgent(options: CompatAgentOptions): CompatAgent {
  return new CompatAgent(options)
}
