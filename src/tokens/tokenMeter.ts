import { GoogleGenAI } from '@google/genai'
import { getLogger } from '@/infrastructure/logging/logger'
import { estimateTokenCount, extractTextFromMessage, isEmptyContent } from '@/utils/textExtraction'

export type TokenPreflight = {
  inputTokens: number
  note?: string
}

export type TokenUsage = {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
  cachedContentTokenCount?: number
  thoughtsTokenCount?: number
  promptTokensDetails?: unknown
  candidatesTokensDetails?: unknown
}

export interface ITokenMeter {
  preflight(contentsOrRequest: string | unknown[] | Record<string, unknown>): Promise<TokenPreflight>
  finalize(generateContentResponse: Record<string, unknown>): TokenUsage
}

export interface TokenMeterOptions {
  model?: string
  apiKey?: string
  vertexai?: {
    project: string
    location: string
    serviceAccountPath?: string
  }
}

export class TokenMeter implements ITokenMeter {
  private client: GoogleGenAI
  private model: string

  constructor(opts: TokenMeterOptions = {}) {
    const { model = 'gemini-2.5-flash', apiKey, vertexai } = opts

    if (vertexai) {
      this.client = new GoogleGenAI({
        vertexai: true,
        project: vertexai.project,
        location: vertexai.location,
        ...(vertexai.serviceAccountPath
          ? {
              googleAuthOptions: {
                keyFile: vertexai.serviceAccountPath,
              },
            }
          : {}),
      })
    } else {
      this.client = new GoogleGenAI({ apiKey })
    }

    this.model = model
  }

  async preflight(contentsOrRequest: string | unknown[] | Record<string, unknown>): Promise<TokenPreflight> {
    try {
      // Convert input to the format expected by countTokens
      const contents = this.normalizeContents(contentsOrRequest)

      const result = await this.client.models.countTokens({
        model: this.model,
        contents: contents as Array<{ role: string; parts: Array<{ text: string }> }>,
      })

      return {
        inputTokens: (result as { totalTokens: number }).totalTokens,
      }
    } catch (error) {
      getLogger()
        .withContext({ service: 'token-meter' })
        .warn('countTokens failed, using fallback estimation', { error: error instanceof Error ? error.message : String(error) })

      // Fallback estimation
      return this.fallbackEstimation(contentsOrRequest)
    }
  }

  finalize(generateContentResponse: Record<string, unknown>): TokenUsage {
    const usageMetadata = generateContentResponse.usageMetadata as Record<string, unknown> | undefined

    if (!usageMetadata) {
      throw new Error('usageMetadata not found in response')
    }

    return {
      promptTokenCount: (usageMetadata.promptTokenCount as number) || 0,
      candidatesTokenCount: (usageMetadata.candidatesTokenCount as number) || 0,
      totalTokenCount: (usageMetadata.totalTokenCount as number) || 0,
      cachedContentTokenCount: usageMetadata.cachedContentTokenCount as number | undefined,
      thoughtsTokenCount: usageMetadata.thoughtsTokenCount as number | undefined,
      promptTokensDetails: usageMetadata.promptTokensDetails,
      candidatesTokensDetails: usageMetadata.candidatesTokensDetails,
    }
  }

  private normalizeContents(contentsOrRequest: string | unknown[] | Record<string, unknown>): unknown[] {
    if (typeof contentsOrRequest === 'string') {
      return [{ parts: [{ text: contentsOrRequest }] }]
    }

    if (Array.isArray(contentsOrRequest)) {
      return contentsOrRequest
    }

    if (typeof contentsOrRequest === 'object' && contentsOrRequest !== null && 'contents' in contentsOrRequest) {
      return (contentsOrRequest as Record<string, unknown>).contents as unknown[]
    }

    // Default fallback
    return [{ parts: [{ text: String(contentsOrRequest) }] }]
  }

  private fallbackEstimation(contentsOrRequest: string | unknown[] | Record<string, unknown>): TokenPreflight {
    const text = extractTextFromMessage(contentsOrRequest)

    // Handle empty cases explicitly
    if (isEmptyContent(contentsOrRequest)) {
      return {
        inputTokens: 0,
        note: 'Fallback estimation due to API failure',
      }
    }

    const estimatedTokens = estimateTokenCount(text)

    return {
      inputTokens: estimatedTokens,
      note: 'Fallback estimation due to API failure',
    }
  }
}
