import type { ChunkAnalysisResult } from '@/types/chunk'

// Minimal analyzed chunk structure used by storage-backed repository.
export interface AnalyzedChunk {
	chunkIndex: number
	analysis: ChunkAnalysisResult
}

// Repository contract for obtaining analyzed chunk data (currently used by
// storage adapter. Extend here (not inline) to keep infrastructure decoupled.
export interface IChunkRepository {
	getAnalyzedChunks(jobId: string, chunkIndices: number[]): Promise<AnalyzedChunk[]>
}
