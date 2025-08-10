import type { NarrativeAnalysisInput } from '@/types/episode'

export interface AnalyzedChunk {
  chunkIndex: number
  analysis: NarrativeAnalysisInput['chunks'][number]['analysis']
}

export interface IChunkRepository {
  getAnalyzedChunks(jobId: string, chunkIndices: number[]): Promise<AnalyzedChunk[]>
}
