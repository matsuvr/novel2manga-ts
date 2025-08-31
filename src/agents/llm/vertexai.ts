import { GoogleGenAI } from '@google/genai'
import type { GenerateStructuredParams, LlmClient } from './types'
import { extractFirstJsonChunk, sanitizeLlmJsonResponse } from './utils'
import { getLogger } from '@/infrastructure/logging/logger'

export interface VertexAIConfig {
  model: string
  project: string
  location: string
  serviceAccountPath?: string
}

export class VertexAIClient implements LlmClient {
  readonly provider = 'vertexai' as const
  private readonly client: GoogleGenAI
  private readonly model: string

  constructor(cfg: VertexAIConfig) {
    this.model = cfg.model

    // Initialize Google GenAI client with Vertex AI configuration
    this.client = new GoogleGenAI({
      vertexai: true,
      project: cfg.project,
      location: cfg.location,
    })

    // Set GOOGLE_APPLICATION_CREDENTIALS if serviceAccountPath is provided
    if (cfg.serviceAccountPath) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = cfg.serviceAccountPath
    }
  }

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    spec,
    options,
  }: GenerateStructuredParams<T>): Promise<T> {
    if (!options || typeof options.maxTokens !== 'number') {
      throw new Error(`${this.provider}: missing generation options (maxTokens) from config`)
    }
    if (typeof userPrompt !== 'string') {
      throw new Error(`${this.provider}: invalid argument userPrompt (string required)`)
    }

    const isVerbose = process.env.LOG_LLM_REQUESTS === '1' || process.env.NODE_ENV === 'development'
    const logger = getLogger().withContext({ service: `llm-${this.provider}`, model: this.model })
    logger.info('Making request')
    logger.info('Model selected')

    try {
      // Construct the full prompt using provided system and user prompts
      // Construct contents as an array of message objects with roles
      const contents = []
      if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
        contents.push({
          role: 'system',
          parts: [{ text: systemPrompt.trim() }],
        })
      }
      if (userPrompt && typeof userPrompt === 'string' && userPrompt.trim()) {
        contents.push({
          role: 'user',
          parts: [{ text: userPrompt.trim() }],
        })
      }

      // Generate content using Vertex AI
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          maxOutputTokens: options.maxTokens,
          temperature: 0.1,
          topP: 0.9,
          stopSequences: options.stop,
        },
      })

      if (isVerbose) {
        logger.debug('Raw response received')
      }

      // Extract text from response
      const content = response.text
      if (!content || content.trim().length === 0) {
        throw new Error(`${this.provider}: empty or non-text response`)
      }

      if (isVerbose) {
        logger.debug('Extracted content (preview)', { preview: this.truncate(content, 800) })
        logger.debug('Content length', { length: content.length })
      }

      // Extract JSON from the response
      const jsonText = extractFirstJsonChunk(content)
      logger.debug('Extracted JSON text (preview)', { preview: this.truncate(jsonText, 200) })

      // Parse JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(jsonText)
      } catch (jsonError) {
        const errorMsg = jsonError instanceof Error ? jsonError.message : String(jsonError)
        logger.error('JSON parse error for LLM response', {
          error: errorMsg,
          rawContent: this.truncate(jsonText, 500),
          contentLength: jsonText.length,
          provider: this.provider,
          model: this.model,
        })
        throw new Error(
          `${this.provider}: JSON parse failed: ${errorMsg}. Content preview: ${this.truncate(jsonText, 200)}`,
        )
      }

      // Sanitize the response
      const sanitized = sanitizeLlmJsonResponse(parsed)

      // Check if sanitization was needed
      const originalJson = JSON.stringify(parsed)
      const sanitizedJson = JSON.stringify(sanitized)
      if (originalJson !== sanitizedJson) {
        logger.warn('Structured Output constraint violation detected. Sanitization applied.')
        if (isVerbose) {
          try {
            const origKeys = Array.isArray(parsed)
              ? `array(len=${(parsed as unknown[]).length})`
              : `keys=${Object.keys(parsed as Record<string, unknown>).length}`
            const saniKeys = Array.isArray(sanitized)
              ? `array(len=${(sanitized as unknown[]).length})`
              : `keys=${Object.keys(sanitized as Record<string, unknown>).length}`
            logger.debug('Parsed object summary', { summary: origKeys })
            logger.debug('Sanitized object summary', { summary: saniKeys })
          } catch {
            // ignore preview failures
          }
        }
      } else {
        logger.info('Structured Output worked correctly - no sanitization needed')
      }

      // Validate against schema
      try {
        return spec.schema.parse(sanitized)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('Schema validation failed', { schemaName: spec.schemaName, error: msg })
        try {
          logger.error('Original parsed object keys', { keys: Object.keys(parsed || {}) })
          logger.error('Sanitized object keys', { keys: Object.keys(sanitized || {}) })
          if (isVerbose) {
            logger.error('Parsed preview', { preview: this.safeObjectPreview(parsed) })
            logger.error('Sanitized preview', { preview: this.safeObjectPreview(sanitized) })
          }
        } catch {
          // ignore preview failures
        }
        throw new Error(
          `${this.provider}: schema validation failed: ${msg}. Raw: ${this.truncate(jsonText, 400)}`,
        )
      }
    } catch (error) {
      logger.error('Generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, n)}…` : s
  }

  private safeObjectPreview(obj: unknown): string {
    try {
      if (!obj || typeof obj !== 'object') return String(obj)
      const keys = Object.keys(obj as Record<string, unknown>)
      return `{keys:${keys.length}, sampleKeys:${keys.slice(0, 10).join(',')}}`
    } catch {
      return '[unavailable]'
    }
  }
}
