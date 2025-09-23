import type { AnalyzedChunk, IChunkRepository } from '@/domain/repositories/chunk-repository'
import { createEmptyChunkAnalysis } from '@/types/chunk'
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
        const analysis = data.analysis ?? data
        // Normalize minimal shape to prevent undefined property access downstream
        results.push({
          chunkIndex: index,
          analysis: {
            ...createEmptyChunkAnalysis(),
            ...analysis,
            characters: analysis.characters ?? [],
            scenes: analysis.scenes ?? [],
            dialogues: analysis.dialogues ?? [],
            highlights: analysis.highlights ?? [],
            situations: analysis.situations ?? [],
          },
        })
      }
    }

    return results
  }
}
