import { GoogleGenAI } from '@google/genai'
import { getLogger } from '@/infrastructure/logging/logger'
import { TokenMeter } from '@/tokens/tokenMeter'
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
  private tokenMeter: TokenMeter

  get provider(): string {
    return 'gemini'
  }

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
      this.tokenMeter = new TokenMeter({
        model: config.model,
        vertexai: config.vertexai,
      })
    } else {
      this.client = new GoogleGenAI({ apiKey: config.apiKey })
      this.tokenMeter = new TokenMeter({
        model: config.model,
        apiKey: config.apiKey,
      })
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

      // Preflight token estimation
      const preflightStart = Date.now()
      const preflightRequest = systemText
        ? {
            contents: geminiContents,
            systemInstruction: { role: 'system', parts: [{ text: systemText }] },
          }
        : geminiContents
      const preflight = await this.tokenMeter.preflight(preflightRequest)
      const preflightLatency = Date.now() - preflightStart

      getLogger()
        .withContext({ service: 'tokens_preflight', model })
        .info('Token preflight completed', {
          inputTokens: preflight.inputTokens,
          fallbackNote: preflight.note,
          latency: preflightLatency,
          payloadHash: this.generatePayloadHash(preflightRequest),
        })

      // Log outgoing request payload for debugging empty-contents errors
      try {
        const contentsLength = Array.isArray(geminiContents) ? geminiContents.length : 0
        const preview = contentsLength
          ? String(geminiContents[0]?.parts?.[0]?.text || '').substring(0, 200)
          : null
        getLogger().withContext({ service: 'llm-gemini' }).info('Outgoing payload', {
          contentsLength,
          preview,
          systemInstructionPresent: !!systemText,
          preflightTokens: preflight.inputTokens,
          fallbackNote: preflight.note,
        })
      } catch (e) {
        // no-op: logging must not break generation, but log the failure itself for diagnostics.
        const logger = getLogger().withContext({ service: 'llm-gemini' })
        logger.warn('outgoing_payload_logging_failed', {
          error: e instanceof Error ? e.message : String(e),
        })
      }

      // Check if streaming is requested
      const isStreaming = options.stream === true

      let result: { text?: string; usageMetadata?: unknown }
      if (isStreaming) {
        // Use streaming API
        const stream = await this.client.models.generateContentStream({
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

        // For streaming, we need to collect all chunks and get the final response
        let fullContent = ''
        let finalResponse: { text?: string; usageMetadata?: unknown } | undefined

        for await (const chunk of stream) {
          if (!chunk) continue

          const chunkText = chunk.text ?? ''
          fullContent += chunkText
          // Store the last chunk which should contain usage metadata
          finalResponse = chunk
        }

        // Use the final response or create one with collected content
        result = finalResponse || { text: fullContent }
        if (!result.text && fullContent) {
          result.text = fullContent
        }
      } else {
        // Use regular API
        result = await this.client.models.generateContent({
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
      }

      const content = result.text ?? ''

      // Finalize token usage with actual API response
      const generateStart = Date.now()
      const tokenUsage = this.tokenMeter.finalize(result as unknown as Record<string, unknown>)
      const generateLatency = Date.now() - generateStart

      getLogger()
        .withContext({ service: 'tokens_final', model })
        .info('Token finalization completed', {
          promptTokenCount: tokenUsage.promptTokenCount,
          candidatesTokenCount: tokenUsage.candidatesTokenCount,
          totalTokenCount: tokenUsage.totalTokenCount,
          cachedContentTokenCount: tokenUsage.cachedContentTokenCount,
          thoughtsTokenCount: tokenUsage.thoughtsTokenCount,
          latency: generateLatency,
          streamed: isStreaming,
          payloadHash: this.generatePayloadHash(result),
        })

      // Geminiはツールコールをサポートしていないため、空配列を返す
      const toolCalls: LlmResponse['toolCalls'] = []

      return {
        content,
        toolCalls,
        usage: {
          promptTokens: tokenUsage.promptTokenCount,
          completionTokens: tokenUsage.candidatesTokenCount,
          totalTokens: tokenUsage.totalTokenCount,
          cachedContentTokens: tokenUsage.cachedContentTokenCount,
          thoughtsTokens: tokenUsage.thoughtsTokenCount,
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

  private generatePayloadHash(payload: unknown): string {
    // Simple hash function for payload logging (not cryptographically secure)
    // Used to track request patterns without exposing sensitive data
    const payloadStr = JSON.stringify(payload) || ''
    let hash = 0
    for (let i = 0; i < payloadStr.length; i++) {
      const char = payloadStr.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }
}
