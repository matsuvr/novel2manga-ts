import type { ChunkAnalysisResult } from '@/types/chunk'

export interface AnalyzedChunk {
  chunkIndex: number
  analysis: ChunkAnalysisResult
}

export interface IChunkRepository {
  getAnalyzedChunks(jobId: string, chunkIndices: number[]): Promise<AnalyzedChunk[]>
}
