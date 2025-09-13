import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getChunkSummaryConfig } from '@/config/chunk-summary.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { JsonStorageKeys, StorageFactory } from '@/utils/storage'

// In-memory fallback store for test environments or when storage is unavailable
const memoryCache = new Map<string, string>()
const keyOf = (jobId: string, index: number) => `${jobId}::${index}`

const logger = getLogger().withContext({ util: 'chunk-summary' })

/**
 * Generate or load cached summary for a chunk.
 */
export async function loadOrGenerateSummary(
  jobId: string,
  index: number,
  text: string,
): Promise<string> {
  const key = JsonStorageKeys.chunkSummary(jobId, index)
  try {
    const storage = await StorageFactory.getAnalysisStorage()
    const existing = await storage.get(key)
    if (existing) {
      try {
        const parsed = JSON.parse(existing.text) as { summary?: string }
        if (parsed.summary) return parsed.summary
      } catch (e) {
        logger.warn('Failed to parse cached summary, regenerating.', {
          key,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const summary = await summarize(text, { jobId, chunkIndex: index })
    await storage.put(key, JSON.stringify({ summary }, null, 2), {
      contentType: 'application/json; charset=utf-8',
      jobId,
      chunk: String(index),
    })
    return summary
  } catch {
    // Storage unavailable → use in-memory fallback
    const cached = memoryCache.get(keyOf(jobId, index))
    if (cached) return cached
    const summary = await summarize(text, { jobId, chunkIndex: index })
    memoryCache.set(keyOf(jobId, index), summary)
    return summary
  }
}

/**
 * Retrieve summary if already cached.
 */
export async function getStoredSummary(jobId: string, index: number): Promise<string | undefined> {
  try {
    const storage = await StorageFactory.getAnalysisStorage()
    const key = JsonStorageKeys.chunkSummary(jobId, index)
    const existing = await storage.get(key)
    if (!existing) return undefined
    try {
      const parsed = JSON.parse(existing.text) as { summary?: string }
      return parsed.summary
    } catch (e) {
      logger.warn('Failed to parse stored summary.', {
        key,
        error: e instanceof Error ? e.message : String(e),
      })
      return undefined
    }
  } catch {
    // Fallback to in-memory cache
    return memoryCache.get(keyOf(jobId, index))
  }
}

async function summarize(
  text: string,
  telemetry?: { jobId?: string; chunkIndex?: number },
): Promise<string> {
  const config = getChunkSummaryConfig()
  if (String(process.env.N2M_MOCK_LLM) === '1') {
    return utf8Truncate(text, config.maxLength)
  }
  const generator = getLlmStructuredGenerator()
  const schema = z.object({ summary: z.string().max(config.maxLength) })
  const result = await generator.generateObjectWithFallback({
    name: 'chunk-summarizer',
    systemPrompt: config.systemPrompt,
    userPrompt: text,
    schema,
    schemaName: 'ChunkSummary',
    telemetry: { ...telemetry, stepName: 'summary' },
  })
  logger.info('Chunk summary generated', {
    jobId: telemetry?.jobId,
    chunkIndex: telemetry?.chunkIndex,
    length: result.summary.length,
  })
  return result.summary
}

function utf8Truncate(text: string, maxBytes: number): string {
  let bytes = 0
  let result = ''
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf8')
    if (bytes + charBytes > maxBytes) break
    bytes += charBytes
    result += char
  }
  return result
}
