import { getEpisodeConfig } from '@/config'
import type { ChunkAnalysisResult, ChunkData } from '@/types/chunk'
import type { NarrativeAnalysisInput } from '@/types/episode'
import type { Storage } from '@/utils/storage'

export interface PrepareNarrativeInputOptions {
  jobId: string
  startChunkIndex: number
  targetChars?: number
  minChars?: number
  maxChars?: number
}

interface StorageBundle {
  chunkStorage: Storage
  analysisStorage: Storage
  StorageKeys: typeof import('@/utils/storage').StorageKeys
}

function transformAnalysisResult(
  analysisResult: ChunkAnalysisResult | null,
): NarrativeAnalysisInput['chunks'][0]['analysis'] {
  return {
    summary: '',
    characters:
      analysisResult?.characters?.map((c) => ({
        name: c.name,
        role: c.role,
      })) || [],
    dialogues: analysisResult?.dialogues || [],
    scenes: analysisResult?.scenes || [],
    highlights:
      analysisResult?.highlights?.map((h) => ({
        text: h.content,
        importance: h.importance,
        description: h.description,
        startIndex: h.startIndex ?? 0,
        endIndex: h.endIndex ?? 0,
      })) || [],
  }
}

async function loadChunkInput(
  jobId: string,
  chunkIndex: number,
  storages: StorageBundle,
): Promise<NarrativeAnalysisInput['chunks'][0] | null> {
  const { chunkStorage, analysisStorage, StorageKeys } = storages
  const chunkKey = StorageKeys.chunk(jobId, chunkIndex)

  const chunkObj = await chunkStorage.get(chunkKey)
  const chunkData = chunkObj ? { text: chunkObj.text } : null

  if (!chunkData) {
    return null
  }

  const analysisKey = StorageKeys.chunkAnalysis(jobId, chunkIndex)
  const analysisObj = await analysisStorage.get(analysisKey)
  const analysisResult = analysisObj ? (JSON.parse(analysisObj.text) as ChunkAnalysisResult) : null

  return {
    chunkIndex,
    text: chunkData.text,
    analysis: transformAnalysisResult(analysisResult),
  }
}

async function gatherChunkInputs(params: {
  jobId: string
  startChunkIndex: number
  targetChars: number
  minChars: number
  maxChars: number
  storages: StorageBundle
}): Promise<NarrativeAnalysisInput['chunks']> {
  const { jobId, startChunkIndex, targetChars, minChars, maxChars, storages } = params
  const chunks: NarrativeAnalysisInput['chunks'] = []
  let totalChars = 0
  let currentChunkIndex = startChunkIndex

  // 設定からチャンク数上限を取得
  const episodeConfig = getEpisodeConfig()
  const maxChunksPerEpisode = episodeConfig.maxChunksPerEpisode

  while (totalChars < targetChars && chunks.length < maxChunksPerEpisode) {
    const chunkInput = await loadChunkInput(jobId, currentChunkIndex, storages)
    if (!chunkInput) break

    chunks.push(chunkInput)
    totalChars += chunkInput.text.length
    currentChunkIndex++

    if (totalChars >= minChars && totalChars <= maxChars) {
      const nextObj = await storages.chunkStorage.get(
        storages.StorageKeys.chunk(jobId, currentChunkIndex),
      )
      if (!nextObj) break

      const potentialTotal = totalChars + nextObj.text.length
      if (potentialTotal > maxChars) {
        break
      }
    }
  }

  return chunks
}

export async function prepareNarrativeAnalysisInput(
  options: PrepareNarrativeInputOptions,
): Promise<NarrativeAnalysisInput | null> {
  const episodeConfig = getEpisodeConfig()
  const {
    jobId,
    startChunkIndex,
    targetChars = episodeConfig.targetCharsPerEpisode,
    minChars = episodeConfig.minCharsPerEpisode,
    maxChars = episodeConfig.maxCharsPerEpisode,
  } = options

  // 動的にストレージAPIを取得（テストの部分モック互換）
  const { StorageFactory, StorageKeys } = await import('@/utils/storage')
  const storages: StorageBundle = {
    StorageKeys,
    chunkStorage: await StorageFactory.getChunkStorage(),
    analysisStorage: await StorageFactory.getAnalysisStorage(),
  }

  // Add retry logic to handle timing issues in test environments
  const maxRetries = 5
  let chunks: NarrativeAnalysisInput['chunks'] = []

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    chunks = await gatherChunkInputs({
      jobId,
      startChunkIndex,
      targetChars,
      minChars,
      maxChars,
      storages,
    })

    if (chunks.length > 0) {
      break
    }

    // If no chunks found and this isn't the last attempt, wait a bit and retry
    if (attempt < maxRetries - 1) {
      const waitTime = 100 * (attempt + 1) // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }

  if (chunks.length === 0) {
    return null
  }

  return {
    jobId,
    chunks,
    targetCharsPerEpisode: targetChars,
    minCharsPerEpisode: minChars,
    maxCharsPerEpisode: maxChars,
    startingEpisodeNumber: 1,
    isMiddleOfNovel: false,
    previousEpisodeEndText: undefined,
  }
}

// Note: Page estimation removed - using advanced LLM for intelligent page breaks

export function validateEpisodeBoundaries(
  boundaries: Array<{
    startChunk: number
    startCharIndex: number
    endChunk: number
    endCharIndex: number
  }>,
  chunks: ChunkData[],
): boolean {
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i]

    const startChunk = chunks.find((c) => c.chunkIndex === boundary.startChunk)
    const endChunk = chunks.find((c) => c.chunkIndex === boundary.endChunk)

    if (!startChunk || !endChunk) {
      return false
    }

    if (boundary.startCharIndex < 0 || boundary.startCharIndex > startChunk.text.length) {
      return false
    }

    if (boundary.endCharIndex < 0 || boundary.endCharIndex > endChunk.text.length) {
      return false
    }

    if (i > 0) {
      const prevBoundary = boundaries[i - 1]
      if (
        boundary.startChunk < prevBoundary.endChunk ||
        (boundary.startChunk === prevBoundary.endChunk &&
          boundary.startCharIndex <= prevBoundary.endCharIndex)
      ) {
        return false
      }
    }
  }

  return true
}

export function extractEpisodeText(
  chunks: ChunkData[],
  startChunk: number,
  startCharIndex: number,
  endChunk: number,
  endCharIndex: number,
): string {
  const sortedChunks = chunks
    .filter((c) => c.chunkIndex >= startChunk && c.chunkIndex <= endChunk)
    .sort((a, b) => a.chunkIndex - b.chunkIndex)

  const texts: string[] = []

  for (const chunk of sortedChunks) {
    if (chunk.chunkIndex === startChunk && chunk.chunkIndex === endChunk) {
      texts.push(chunk.text.substring(startCharIndex, endCharIndex))
    } else if (chunk.chunkIndex === startChunk) {
      texts.push(chunk.text.substring(startCharIndex))
    } else if (chunk.chunkIndex === endChunk) {
      texts.push(chunk.text.substring(0, endCharIndex))
    } else {
      texts.push(chunk.text)
    }
  }

  return texts.join('\n\n')
}
