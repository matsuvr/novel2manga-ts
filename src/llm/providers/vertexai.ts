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

export interface VertexAIConfig {
  model?: string
  timeout?: number
  vertexai: {
    project: string
    location: string
    serviceAccountPath?: string
  }
}

/**
 * Vertex AI (Gemini via Vertex) provider client
 */
export class VertexAIClient implements LlmClient {
  private client: GoogleGenAI
  private config: VertexAIConfig
  private tokenMeter: TokenMeter

  constructor(config: VertexAIConfig) {
    if (!config.vertexai?.project || !config.vertexai?.location) {
      throw new InvalidRequestError(
        'VertexAI project/location is required',
        'vertexai',
      )
    }
    this.config = config
    this.client = new GoogleGenAI({
      vertexai: true,
      project: config.vertexai.project,
      location: config.vertexai.location,
      ...(config.vertexai.serviceAccountPath
        ? { googleAuthOptions: { keyFile: config.vertexai.serviceAccountPath } }
        : {}),
    })
    this.tokenMeter = new TokenMeter({
      model: config.model,
      vertexai: config.vertexai,
    })
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    try {
      const model = options.model || this.config.model
      if (!model) {
        throw new Error(
          'Model is required for Vertex AI chat completion. Please specify model in options or config.',
        )
      }

      // Extract system text and convert messages
      const systemText = messages
        .filter((m) => m.role === 'system' && typeof m.content === 'string')
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n\n')

      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((msg) => ({
          role: this.convertRole(msg.role),
          parts: [{ text: msg.content }],
        }))

      // Preflight token estimation
      const preflightStart = Date.now()
      const preflightRequest = systemText
        ? { contents, systemInstruction: { role: 'system', parts: [{ text: systemText }] } }
        : contents
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

      const isStreaming = options.stream === true

      let result: { text?: string; usageMetadata?: unknown }
      if (isStreaming) {
        const stream = await this.client.models.generateContentStream({
          model,
          contents,
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

        let fullContent = ''
        let finalResponse: { text?: string; usageMetadata?: unknown } | undefined
        for await (const chunk of stream) {
          if (!chunk) continue
          const chunkText = chunk.text ?? ''
          fullContent += chunkText
          finalResponse = chunk
        }
        result = finalResponse || { text: fullContent }
        if (!result.text && fullContent) result.text = fullContent
      } else {
        result = await this.client.models.generateContent({
          model,
          contents,
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

      // Finalize token usage
      const finalizeStart = Date.now()
      const tokenUsage = this.tokenMeter.finalize(result as unknown as Record<string, unknown>)
      const finalizeLatency = Date.now() - finalizeStart

      getLogger()
        .withContext({ service: 'tokens_final', model })
        .info('Token finalization completed', {
          promptTokenCount: tokenUsage.promptTokenCount,
          candidatesTokenCount: tokenUsage.candidatesTokenCount,
          totalTokenCount: tokenUsage.totalTokenCount,
          cachedContentTokenCount: tokenUsage.cachedContentTokenCount,
          thoughtsTokenCount: tokenUsage.thoughtsTokenCount,
          latency: finalizeLatency,
          streamed: isStreaming,
          payloadHash: this.generatePayloadHash(result),
        })

      return {
        content,
        toolCalls: [],
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

  // Embeddings currently not implemented for Vertex AI path
  async embeddings?(): Promise<LlmEmbeddingResponse> {
    throw new InvalidRequestError('Embeddings not supported by vertexai', 'vertexai')
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      if (message.includes('quota') || message.includes('rate limit')) {
        return new RateLimitError(error.message, undefined, undefined, error)
      }
      if (message.includes('token') || message.includes('length')) {
        return new TokenLimitError(error.message, 0, 0, undefined, error)
      }
      if (message.includes('timeout') || message.includes('deadline')) {
        return new TimeoutError(error.message, this.config.timeout || 60000, undefined, error)
      }
      if (message.includes('invalid') || message.includes('bad request')) {
        return new InvalidRequestError(error.message, undefined, undefined, error)
      }
    }
    return new ProviderError(
      error instanceof Error ? error.message : 'Unknown Vertex AI error',
      'vertexai',
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    )
  }

  private convertRole(role: LlmMessage['role']): string {
    switch (role) {
      case 'system':
        return 'user' // Vertex/Gemini does not support system directly
      case 'user':
        return 'user'
      case 'assistant':
        return 'model'
      case 'tool':
        return 'user'
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
    const payloadStr = JSON.stringify(payload) || ''
    let hash = 0
    for (let i = 0; i < payloadStr.length; i++) {
      const char = payloadStr.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }
}
