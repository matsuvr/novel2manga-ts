import { GoogleGenAI } from '@google/genai'
import type {
  LlmClient,
  LlmClientOptions,
  LlmEmbeddingResponse,
  LlmMessage,
  LlmResponse,
  LlmTool,
} from '../client'
import {
  InvalidRequestError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  TokenLimitError,
} from '../client'

export interface GeminiConfig {
  apiKey?: string
  model?: string
  timeout?: number
  vertexai?: {
    project: string
    location: string
    serviceAccountPath?: string
  }
}

export class GeminiClient implements LlmClient {
  private client: GoogleGenAI
  private config: GeminiConfig

  constructor(config: GeminiConfig) {
    this.config = config
    if (config.vertexai) {
      this.client = new GoogleGenAI({
        vertexai: true,
        project: config.vertexai.project,
        location: config.vertexai.location,
        ...(config.vertexai.serviceAccountPath
          ? {
              googleAuthOptions: {
                keyFile: config.vertexai.serviceAccountPath,
              },
            }
          : {}),
      })
    } else {
      this.client = new GoogleGenAI({ apiKey: config.apiKey })
    }
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    try {
      const model = options.model || this.config.model
      if (!model) {
        throw new Error(
          'Model is required for Gemini chat completion. Please specify model in options or config.',
        )
      }

      // Separate system messages and map others to Gemini format
      const systemText = messages
        .filter((m) => m.role === 'system' && typeof m.content === 'string')
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n\n')

      const geminiContents = messages
        .filter((m) => m.role !== 'system')
        .map((msg) => ({
          role: this.convertRole(msg.role),
          parts: [{ text: msg.content }],
        }))

      // Log outgoing request payload for debugging empty-contents errors
      try {
        // Minimal logger to avoid importing heavy logger in this module scope
        // Use console as fallback; in production getLogger is available globally via import if needed
        const contentsLength = Array.isArray(geminiContents) ? geminiContents.length : 0
        const preview = contentsLength
          ? String(geminiContents[0]?.parts?.[0]?.text || '').substring(0, 200)
          : null
        // eslint-disable-next-line no-console
        console.info('[llm-gemini] Outgoing payload', {
          contentsLength,
          preview,
          systemInstructionPresent: !!systemText,
        })
      } catch {
        // no-op
      }

      const result = await this.client.models.generateContent({
        model,
        contents: geminiContents,
        config: {
          systemInstruction: systemText
            ? { role: 'system', parts: [{ text: systemText }] }
            : undefined,
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature,
          topP: options.topP,
          tools: options.tools ? this.convertTools(options.tools) : undefined,
        },
      })

      const content = result.text ?? ''

      // Geminiはツールコールをサポートしていないため、空配列を返す
      const toolCalls: LlmResponse['toolCalls'] = []

      return {
        content,
        toolCalls,
        usage: {
          promptTokens: result.usageMetadata?.promptTokenCount || 0,
          completionTokens: result.usageMetadata?.candidatesTokenCount || 0,
          totalTokens:
            (result.usageMetadata?.promptTokenCount || 0) +
            (result.usageMetadata?.candidatesTokenCount || 0),
        },
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async embeddings(
    input: string | string[],
    options: { model?: string } = {},
  ): Promise<LlmEmbeddingResponse> {
    try {
      const model = options.model
      if (!model) {
        throw new Error('Model is required for Gemini embeddings. Please specify model in options.')
      }

      const inputs = Array.isArray(input) ? input : [input]

      const result = await this.client.models.embedContent({
        model,
        contents: inputs,
      })

      const embeddings =
        result.embeddings?.map((embedding, index) => ({
          embedding: embedding.values || [],
          index,
        })) || []

      return {
        embeddings,
        usage: {
          promptTokens: inputs.reduce((sum, text) => sum + text.length, 0),
          totalTokens: inputs.reduce((sum, text) => sum + text.length, 0),
        },
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      // Gemini SDKのエラーを適切な型に変換
      const message = error.message.toLowerCase()

      if (message.includes('quota') || message.includes('rate limit')) {
        return new RateLimitError(error.message, undefined, undefined, error)
      }

      if (message.includes('token') || message.includes('length')) {
        return new TokenLimitError(
          error.message,
          0, // maxTokensは後で設定
          0, // requestedTokensは後で設定
          undefined,
          error,
        )
      }

      if (message.includes('timeout') || message.includes('deadline')) {
        return new TimeoutError(error.message, this.config.timeout || 30000, undefined, error)
      }

      if (message.includes('invalid') || message.includes('bad request')) {
        return new InvalidRequestError(error.message, undefined, undefined, error)
      }
    }

    return new ProviderError(
      error instanceof Error ? error.message : 'Unknown Gemini error',
      'gemini',
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    )
  }

  private convertRole(role: LlmMessage['role']): string {
    switch (role) {
      case 'system':
        return 'user' // Geminiはsystemロールをサポートしていないため、userに変換
      case 'user':
        return 'user'
      case 'assistant':
        return 'model'
      case 'tool':
        return 'user' // Geminiはtoolロールをサポートしていないため、userに変換
      default:
        return 'user'
    }
  }

  private convertTools(tools: LlmTool[]): Array<{
    functionDeclarations: Array<{
      name: string
      description: string
      parameters: Record<string, unknown>
    }>
  }> {
    // Geminiのツール形式に変換
    return tools.map((tool) => ({
      functionDeclarations: [
        {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      ],
    }))
  }
}
