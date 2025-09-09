import type { AnalyzedChunk, IChunkRepository } from '@/domain/repositories/chunk-repository'
import { StorageFactory } from '@/utils/storage'
import { StorageKeys } from '@/utils/storage-keys'

// Repository implementation backed by StorageFactory, which selects the
// appropriate storage (local filesystem in development, R2 in production).
export class StorageChunkRepository implements IChunkRepository {
  async getAnalyzedChunks(jobId: string, chunkIndices: number[]): Promise<AnalyzedChunk[]> {
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const results: AnalyzedChunk[] = []

    for (const index of chunkIndices) {
      const key = StorageKeys.chunkAnalysis(jobId, index)
      const existing = await analysisStorage.get(key)
      if (existing) {
        const data = JSON.parse(existing.text)
        results.push({
          chunkIndex: index,
          analysis: data.analysis ?? data,
        })
      }
    }

    return results
  }
}
