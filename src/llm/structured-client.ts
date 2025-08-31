/**
 * Structured Outputs対応のLLMクライアントヘルパー
 */

import type { z } from 'zod'
import type {
  LlmClient,
  LlmClientOptions,
  LlmMessage,
  LlmResponse,
  StructuredLlmResponse,
} from './client.js'
import {
  createStructuredOptions,
  parseStructuredOutput,
  safeParseStructuredOutput,
} from './zod-helper.js'

/**
 * Structured Outputs対応のLLMクライアントラッパー
 */
export class StructuredLlmClient {
  constructor(private client: LlmClient) {}

  /**
   * 型安全なStructured Outputsでチャット完了を実行
   */
  async chatWithSchema<T extends z.ZodTypeAny>(
    messages: LlmMessage[],
    schema: T,
    schemaName: string,
    baseOptions: Omit<LlmClientOptions, 'responseFormat'> = {},
  ): Promise<StructuredLlmResponse<z.infer<T>>> {
    const options = createStructuredOptions(schema, schemaName, baseOptions)
    const response = await this.client.chat(messages, options)

    // refusal対応
    if (response.refusal) {
      return {
        ...response,
        parsed: undefined,
        refusal: response.refusal,
      }
    }

    // 構造化データをパース
    try {
      const parsed = parseStructuredOutput(response.content, schema)
      return {
        ...response,
        parsed,
        refusal: null,
      }
    } catch (_error) {
      // パースエラーでも生レスポンスは返す（デバッグのため）
      return {
        ...response,
        parsed: undefined,
        refusal: null,
      }
    }
  }

  /**
   * 安全なStructured Outputsチャット完了（エラー時でも部分的なレスポンスを返す）
   */
  async safeChatWithSchema<T extends z.ZodTypeAny>(
    messages: LlmMessage[],
    schema: T,
    schemaName: string,
    baseOptions: Omit<LlmClientOptions, 'responseFormat'> = {},
  ): Promise<{
    success: boolean
    response?: StructuredLlmResponse<z.infer<T>>
    error?: string
  }> {
    try {
      const response = await this.chatWithSchema(messages, schema, schemaName, baseOptions)
      return { success: true, response }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 既存のLlmResponseを構造化データでパース
   */
  parseResponse<T extends z.ZodTypeAny>(
    response: LlmResponse,
    schema: T,
  ): StructuredLlmResponse<z.infer<T>> {
    if (response.refusal) {
      return {
        ...response,
        parsed: undefined,
        refusal: response.refusal,
      }
    }

    const parseResult = safeParseStructuredOutput(response.content, schema)
    if (parseResult.success) {
      return {
        ...response,
        parsed: parseResult.data,
        refusal: null,
      }
    } else {
      return {
        ...response,
        parsed: undefined,
        refusal: null,
      }
    }
  }

  /**
   * 元のLlmClientに直接アクセス
   */
  get raw(): LlmClient {
    return this.client
  }
}

/**
 * LlmClientをStructured Outputs対応ラッパーで包む便利関数
 */
export function withStructuredOutputs(client: LlmClient): StructuredLlmClient {
  return new StructuredLlmClient(client)
}
