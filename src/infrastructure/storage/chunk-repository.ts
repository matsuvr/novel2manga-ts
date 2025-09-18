import type { AnalyzedChunk, IChunkRepository } from '@/domain/repositories/chunk-repository'
import { getNovelIdForJob } from '@/utils/job'
import { StorageFactory, StorageKeys } from '@/utils/storage'

// Repository implementation backed by StorageFactory, which selects the
export class StorageChunkRepository implements IChunkRepository {
  async getAnalyzedChunks(jobId: string, chunkIndices: number[]): Promise<AnalyzedChunk[]> {
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const results: AnalyzedChunk[] = []
    const novelId = await getNovelIdForJob(jobId)

    for (const index of chunkIndices) {
      const key = StorageKeys.chunkAnalysis({ novelId, jobId, index })
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
