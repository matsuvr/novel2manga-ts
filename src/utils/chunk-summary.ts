import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getChunkSummaryConfig } from '@/config/chunk-summary.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { JsonStorageKeys, StorageFactory } from '@/utils/storage'

const logger = getLogger().withContext({ util: 'chunk-summary' })

/**
 * Generate or load cached summary for a chunk.
 */
export async function loadOrGenerateSummary(
  jobId: string,
  index: number,
  text: string,
): Promise<string> {
  const storage = await StorageFactory.getAnalysisStorage()
  const key = JsonStorageKeys.chunkSummary(jobId, index)
  const existing = await storage.get(key)
  if (existing) {
    try {
      const parsed = JSON.parse(existing.text) as { summary?: string }
      if (parsed.summary) return parsed.summary
    } catch {
      // ignore JSON parse errors and regenerate summary
    }
  }

  const summary = await summarize(text, { jobId, chunkIndex: index })
  await storage.put(key, JSON.stringify({ summary }, null, 2), {
    contentType: 'application/json; charset=utf-8',
    jobId,
    chunk: String(index),
  })
  return summary
}

/**
 * Retrieve summary if already cached.
 */
export async function getStoredSummary(jobId: string, index: number): Promise<string | undefined> {
  const storage = await StorageFactory.getAnalysisStorage()
  const key = JsonStorageKeys.chunkSummary(jobId, index)
  const existing = await storage.get(key)
  if (!existing) return undefined
  try {
    const parsed = JSON.parse(existing.text) as { summary?: string }
    return parsed.summary
  } catch {
    return undefined
  }
}

async function summarize(
  text: string,
  telemetry?: { jobId?: string; chunkIndex?: number },
): Promise<string> {
  const config = getChunkSummaryConfig()
  if (String(process.env.N2M_MOCK_LLM) === '1') {
    return text.slice(0, config.maxLength)
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
