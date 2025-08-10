import type { ChunkAnalysisResult } from '@/types/chunk'
import { StorageFactory } from '@/utils/storage'

export class NarrativeArcDataService {
  async loadAnalyses(
    jobId: string,
    chunks: Array<{ chunkIndex: number; text: string }>,
  ): Promise<Array<{ chunkIndex: number; text: string; analysis: ChunkAnalysisResult }>> {
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const results: Array<{
      chunkIndex: number
      text: string
      analysis: ChunkAnalysisResult
    }> = []

    for (const chunk of chunks) {
      const path = `analyses/${jobId}/chunk_${chunk.chunkIndex}.json`
      const existing = await analysisStorage.get(path)

      if (!existing) {
        throw new Error(`Chunk analysis not found for job ${jobId}, chunk ${chunk.chunkIndex}`)
      }

      const data = JSON.parse(existing.text)
      results.push({
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        analysis: data.analysis,
      })
    }

    return results
  }
}
