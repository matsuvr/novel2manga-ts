// Use non "node:" specifier for compatibility with test spies

import fs from 'node:fs/promises'
import path from 'node:path'
import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import {
  dropUnionCombinators,
  enforceJsonSchemaConstraintsForStructuredOutputs,
  flattenRootObjectSchema,
  inlineAllRefsAndDropDefs,
} from './openai-compatible'
import type { GenerateStructuredParams, LlmClient } from './types'
import { extractFirstJsonChunk, sanitizeLlmJsonResponse } from './utils'

// Helpers for retry/backoff and raw response persistence
async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

// Tunables
const BASE_BACKOFF_MS = 300
const MAX_DEBUG_FIELDS = 20

async function saveRawResponse(
  resp: unknown,
  tag: string,
  meta?: { jobId?: string } | null,
): Promise<void> {
  // Persist raw responses for debugging in tests and development.
  // Intentionally enabled unconditionally in tests; controlled by env elsewhere.
  // If you need to disable, set SAVE_RAW_LLM_RESPONSES=0 explicitly.
  if (process.env.SAVE_RAW_LLM_RESPONSES === '0') return
  try {
    const dir = path.resolve(process.cwd(), 'raw-responses')
    await fs.mkdir(dir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const jid = meta?.jobId ? `${meta.jobId}_` : ''
    const filename = `${ts}_${jid}${tag}.json`
    const filePath = path.join(dir, filename)
    const body = JSON.stringify(
      { savedAt: new Date().toISOString(), meta: meta ?? null, resp },
      null,
      2,
    )
    await fs.writeFile(filePath, body, { encoding: 'utf-8' })
  } catch {
    // ignore failures to not block generation flow, but log for diagnostics
    try {
      getLogger().warn(`Failed to save raw LLM response for tag "${tag}"`)
    } catch {
      // noop - ensure we never throw while trying to log
    }
  }
}

export interface VertexAIConfig {
  model: string
  project: string
  location: string
  serviceAccountPath?: string
}

export interface VertexAIClientConfig extends VertexAIConfig {
  provider: 'vertexai' | 'gemini'
}

export class VertexAIClient implements LlmClient {
  readonly provider: 'vertexai' | 'gemini'
  private readonly client: GoogleGenAI
  private readonly model: string

  constructor(cfg: VertexAIClientConfig) {
    this.provider = cfg.provider
    this.model = cfg.model

    // Initialize Google GenAI client with Vertex AI configuration
    this.client = new GoogleGenAI({
      vertexai: true,
      project: cfg.project,
      location: cfg.location,
      ...(cfg.serviceAccountPath ? { googleAuthOptions: { keyFile: cfg.serviceAccountPath } } : {}),
    })
  }

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    spec,
    options,
    telemetry,
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
      // Construct request for Vertex AI Gemini
      // Important: Gemini on Vertex AI does not accept 'system' role in contents.
      // Put system prompt into top-level systemInstruction and keep contents to user/model only.
      const sys = typeof systemPrompt === 'string' ? systemPrompt.trim() : ''
      const usr = typeof userPrompt === 'string' ? userPrompt.trim() : ''

      const contents = [] as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
      if (usr) {
        contents.push({ role: 'user', parts: [{ text: usr }] })
      }

      // Build response schema for strict JSON using Zod -> JSON Schema
      // Align with Groq/OpenAI constraints to keep depth small and no $refs
      let jsonSchema = zodToJsonSchema(spec.schema, {
        name: spec.schemaName,
        $refStrategy: 'none',
      })
      jsonSchema = flattenRootObjectSchema(jsonSchema) as typeof jsonSchema
      jsonSchema = inlineAllRefsAndDropDefs(jsonSchema) as typeof jsonSchema
      jsonSchema = dropUnionCombinators(jsonSchema) as typeof jsonSchema
      jsonSchema = enforceJsonSchemaConstraintsForStructuredOutputs(jsonSchema) as typeof jsonSchema

      // Top-level systemInstruction is expected by our tests and accepted by SDK
      const request: Parameters<typeof this.client.models.generateContent>[0] = {
        ...(sys ? { systemInstruction: { role: 'system', parts: [{ text: sys }] } } : {}),
        model: this.model,
        contents,
        config: {
          // also include via config per SDK typings
          systemInstruction: sys ? { role: 'system', parts: [{ text: sys }] } : undefined,
          maxOutputTokens: options.maxTokens,
          temperature: 0.1,
          topP: 0.9,
          stopSequences: options.stop,
          // Enforce JSON-only response with schema on Vertex AI/Gemini
          responseMimeType: 'application/json',
          // Use JSON Schema variant for GenAI SDK (maps to response_json_schema)
          responseJsonSchema: jsonSchema as unknown,
        },
      }

      // Log outgoing request payload (length and small preview) to help debug empty contents issues
      try {
        logger.info('LLM request payload', {
          contentsLength: contents.length,
          contentsPreview: contents.length
            ? (contents[0]?.parts?.[0]?.text?.substring(0, 200) ?? null)
            : null,
          systemInstructionPresent: !!sys,
        })
      } catch (e) {
        // noop - logging must not break generation, but log the failure itself for diagnostics
        logger.warn('Failed to log LLM request payload', {
          error: e instanceof Error ? e.message : String(e),
        })
      }

      // Try generateContent with retries for empty responses.
      const maxRetries = 2 // user requested: retry up to 2 times
      let lastResponse: unknown = null
      let lastContent: string | null = null
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const backoffMs = BASE_BACKOFF_MS * 2 ** (attempt - 1)
          logger.warn('Empty response previously, retrying after backoff', { attempt, backoffMs })
          // simple backoff
          await sleep(backoffMs)
        }

        // Generate content using Vertex AI
        const response = await this.client.models.generateContent(request)
        lastResponse = response

        if (isVerbose) {
          logger.debug('Raw response received', { attempt })
        }

        // Extract text from response with robust fallbacks.
        lastContent = extractTextFromGenAIResponse(response)
        if (lastContent && lastContent.trim().length > 0) {
          // Got content - break retry loop and proceed to parse/validate
          if (isVerbose) {
            logger.debug('Extracted content (preview)', { preview: truncate(lastContent, 800) })
            logger.debug('Content length', { length: lastContent.length })
          }
          break
        }

        // If reached here, content was empty
        try {
          const metaObj =
            typeof response === 'object' && response !== null
              ? (response as unknown as Record<string, unknown>)
              : {}
          const safeId = typeof metaObj.id === 'string' ? metaObj.id : undefined
          const safeModelInResp = typeof metaObj.model === 'string' ? metaObj.model : undefined
          const safeOutputTextLen =
            typeof metaObj.output_text === 'string'
              ? (metaObj.output_text as string).length
              : undefined
          const safeFields = Object.keys(metaObj).slice(0, MAX_DEBUG_FIELDS)
          logger.warn('Empty LLM content - response meta snapshot', {
            attempt,
            safeId,
            safeModelInResp,
            safeOutputTextLen,
            safeFields,
          })
        } catch {
          // noop - logging must not break the flow
        }

        // if not last attempt, loop will retry
        if (attempt === maxRetries) {
          // persist raw response for postmortem
          try {
            const maybeId =
              typeof lastResponse === 'object' &&
              lastResponse !== null &&
              typeof (lastResponse as Record<string, unknown>).id === 'string'
                ? ((lastResponse as Record<string, unknown>).id as string)
                : undefined
            await saveRawResponse(lastResponse, `no-content-${this.provider}-${this.model}`, {
              jobId: maybeId,
            })
          } catch (e) {
            logger.warn('Failed to save raw LLM response for debugging', {
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }
      }

      // After retries, if still no content -> surface a clear error
      if (!lastContent || lastContent.trim().length === 0) {
        throw new Error(`${this.provider}: no response content after ${maxRetries + 1} attempts`)
      }

      // Extract JSON from the response. If extraction fails (no balanced JSON
      // chunk found), persist raw response for postmortem and surface a
      // clear error to callers.
      let jsonText: string
      try {
        jsonText = extractFirstJsonChunk(lastContent)
        logger.debug('Extracted JSON text (preview)', { preview: truncate(jsonText, 200) })
      } catch (extractErr) {
        const msg = extractErr instanceof Error ? extractErr.message : String(extractErr)
        logger.error('Failed to extract JSON chunk from LLM response', {
          error: msg,
          provider: this.provider,
          model: this.model,
        })
        try {
          const maybeId =
            typeof lastResponse === 'object' &&
            lastResponse !== null &&
            typeof (lastResponse as Record<string, unknown>).id === 'string'
              ? ((lastResponse as Record<string, unknown>).id as string)
              : undefined
          await saveRawResponse(lastResponse, `no-json-${this.provider}-${this.model}`, {
            jobId: maybeId,
          })
        } catch (e) {
          logger.warn('Failed to save raw LLM response for no-json debugging', {
            error: e instanceof Error ? e.message : String(e),
          })
        }
        throw new Error(`${this.provider}: no JSON chunk found in response: ${msg}`)
      }

      if (telemetry?.jobId && telemetry?.agentName) {
        const usage = extractUsageMetadata(lastResponse)
        if (!usage) {
          logger.error('Token usage metadata missing from Vertex AI response', {
            jobId: telemetry.jobId,
            agent: telemetry.agentName,
          })
        } else {
          try {
            await db.tokenUsage().record({
              jobId: telemetry.jobId,
              agentName: telemetry.agentName,
              stepName: telemetry.stepName,
              chunkIndex: telemetry.chunkIndex,
              episodeNumber: telemetry.episodeNumber,
              provider: this.provider,
              model: this.model,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            })
          } catch (recordError) {
            logger.error('Failed to record Vertex AI token usage', {
              error: recordError instanceof Error ? recordError.message : String(recordError),
              jobId: telemetry.jobId,
              agent: telemetry.agentName,
            })
          }
        }
      }

      // Parse JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(jsonText)
      } catch (jsonError) {
        const errorMsg = jsonError instanceof Error ? jsonError.message : String(jsonError)
        logger.error('JSON parse error for LLM response', {
          error: errorMsg,
          rawContent: truncate(jsonText, 500),
          contentLength: jsonText.length,
          provider: this.provider,
          model: this.model,
        })
        try {
          const maybeId =
            typeof lastResponse === 'object' &&
            lastResponse !== null &&
            typeof (lastResponse as Record<string, unknown>).id === 'string'
              ? ((lastResponse as Record<string, unknown>).id as string)
              : undefined
          await saveRawResponse(lastResponse, `parse-failed-${this.provider}-${this.model}`, {
            jobId: maybeId,
          })
        } catch (e) {
          logger.warn('Failed to save raw LLM response for parse failure debugging', {
            error: e instanceof Error ? e.message : String(e),
          })
        }
        throw new Error(
          `${this.provider}: JSON parse failed: ${errorMsg}. Content preview: ${truncate(jsonText, 200)}`,
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
            logger.error('Parsed preview', { preview: safeObjectPreview(parsed) })
            logger.error('Sanitized preview', { preview: safeObjectPreview(sanitized) })
          }
        } catch {
          // ignore preview failures
        }
        throw new Error(
          `${this.provider}: schema validation failed: ${msg}. Raw: ${truncate(jsonText, 400)}`,
        )
      }
    } catch (error) {
      logger.error('Generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

function extractTextFromGenAIResponse(resp: unknown): string | null {
  if (!resp || typeof resp !== 'object') return null
  const r = resp as Record<string, unknown>

  // 1) Common SDK: response.text
  if (typeof r.text === 'string' && r.text.trim().length > 0) return r.text

  // 2) Responses API convenience field
  if (typeof r.output_text === 'string' && r.output_text.trim().length > 0) return r.output_text

  // 3) structured output: output: [{ content: [{ text: '...' }, ...] }, ...]
  const output = r.output as unknown
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const content = obj.content as unknown
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue
          const p = part as Record<string, unknown>
          if (typeof p.text === 'string' && p.text.trim().length > 0) return p.text
          if (p.type === 'json_schema' && typeof p.json === 'object' && p.json !== null) {
            try {
              return JSON.stringify(p.json)
            } catch {
              // ignore stringify failures, but log for diagnostics
              try {
                getLogger().warn('Failed to stringify json_schema part from LLM response')
              } catch {
                // noop
              }
            }
          }
        }
      }
    }
  }

  // 4) Chat-like: choices[0].message.content
  const choices = r.choices as unknown
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>
    if (first && typeof first.message === 'object' && first.message !== null) {
      const msg = (first.message as Record<string, unknown>).content
      if (typeof msg === 'string' && msg.trim().length > 0) return msg
    }
  }

  return null
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function safeObjectPreview(obj: unknown): string {
  try {
    if (!obj || typeof obj !== 'object') return String(obj)
    const keys = Object.keys(obj as Record<string, unknown>)
    return `{keys:${keys.length}, sampleKeys:${keys.slice(0, 10).join(',')}}`
  } catch {
    return '[unavailable]'
  }
}

type UsageMetadataSummary = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedContentTokens?: number
  thoughtsTokens?: number
}

function extractUsageMetadata(response: unknown): UsageMetadataSummary | null {
  if (!response || typeof response !== 'object') {
    return null
  }

  const metadata = (response as { usageMetadata?: unknown }).usageMetadata
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const toNumber = (value: unknown): number | null => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }

  const prompt = toNumber((metadata as Record<string, unknown>).promptTokenCount)
  const completion = toNumber((metadata as Record<string, unknown>).candidatesTokenCount)
  const total = toNumber((metadata as Record<string, unknown>).totalTokenCount)
  const cached = toNumber((metadata as Record<string, unknown>).cachedContentTokenCount)
  const thoughts = toNumber((metadata as Record<string, unknown>).thoughtsTokenCount)

  if (prompt === null && completion === null && total === null) {
    return null
  }

  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: total ?? (prompt ?? 0) + (completion ?? 0),
    cachedContentTokens: cached ?? undefined,
    thoughtsTokens: thoughts ?? undefined,
  }
}
