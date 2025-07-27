import { z } from 'zod'

// Status types
export const ChunkStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])
export const JobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])

export type ChunkStatus = z.infer<typeof ChunkStatusSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>

// Novel schema - 小説全体
export const NovelSchema = z.object({
  id: z.string(), // UUID
  title: z.string(),
  originalTextFile: z.string(), // R2: novels/{id}/original.txt
  totalLength: z.number().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date()
})

// Job schema - 処理ジョブ（既存のJobを拡張）
export const JobSchema = z.object({
  id: z.string(),
  novelId: z.string(), // Novel.idへの参照
  status: JobStatusSchema,
  progress: z.number().min(0).max(100),
  totalChunks: z.number().nonnegative(),
  processedChunks: z.number().nonnegative(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  error: z.string().optional()
})

// Chunk schema - テキストチャンク
export const ChunkSchema = z.object({
  id: z.string(),
  novelId: z.string(), // Novel.idへの参照
  chunkIndex: z.number().nonnegative(),
  textFile: z.string(), // R2: novels/{novelId}/chunks/chunk_{index}.txt
  startIndex: z.number().nonnegative(),
  endIndex: z.number().nonnegative(),
  status: ChunkStatusSchema
})

// Analysis summary schemas
const AnalysisSummarySchema = z.object({
  characterCount: z.number().nonnegative(),
  sceneCount: z.number().nonnegative(),
  dialogueCount: z.number().nonnegative(),
  highlightCount: z.number().nonnegative(),
  situationCount: z.number().nonnegative()
})

const IntegratedAnalysisSummarySchema = z.object({
  totalCharacters: z.number().nonnegative(),
  totalScenes: z.number().nonnegative(),
  totalDialogues: z.number().nonnegative(),
  totalHighlights: z.number().nonnegative(),
  totalSituations: z.number().nonnegative()
})

// ChunkAnalysis schema - チャンク毎の解析結果
export const ChunkAnalysisSchema = z.object({
  id: z.string(),
  chunkId: z.string(), // Chunk.idへの参照
  analysisFile: z.string(), // R2: novels/{novelId}/analysis/chunk_{index}.json
  processedAt: z.date(),
  summary: AnalysisSummarySchema
})

// NovelAnalysis schema - 統合された解析結果
export const NovelAnalysisSchema = z.object({
  id: z.string(),
  novelId: z.string(), // Novel.idへの参照
  analysisFile: z.string(), // R2: novels/{novelId}/analysis/integrated.json
  summary: IntegratedAnalysisSummarySchema,
  createdAt: z.date(),
  updatedAt: z.date()
})

// TypeScript型定義
export type Novel = z.infer<typeof NovelSchema>
export type Job = z.infer<typeof JobSchema>
export type Chunk = z.infer<typeof ChunkSchema>
export type ChunkAnalysis = z.infer<typeof ChunkAnalysisSchema>
export type NovelAnalysis = z.infer<typeof NovelAnalysisSchema>
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>
export type IntegratedAnalysisSummary = z.infer<typeof IntegratedAnalysisSummarySchema>

// R2ファイルパス生成ヘルパー
type FileType = 
  | 'original' 
  | 'chunk' 
  | 'chunk-analysis' 
  | 'integrated-analysis' 
  | 'layout' 
  | 'preview'

interface FilePathOptions {
  chunkIndex?: number
  episodeNumber?: number
  pageNumber?: number
}

export function getR2FilePath(
  novelId: string, 
  fileType: FileType, 
  options: FilePathOptions = {}
): string {
  const basePath = `novels/${novelId}`
  
  switch (fileType) {
    case 'original':
      return `${basePath}/original.txt`
    
    case 'chunk':
      if (options.chunkIndex === undefined) {
        throw new Error('chunkIndex is required for chunk file type')
      }
      return `${basePath}/chunks/chunk_${options.chunkIndex}.txt`
    
    case 'chunk-analysis':
      if (options.chunkIndex === undefined) {
        throw new Error('chunkIndex is required for chunk-analysis file type')
      }
      return `${basePath}/analysis/chunk_${options.chunkIndex}.json`
    
    case 'integrated-analysis':
      return `${basePath}/analysis/integrated.json`
    
    case 'layout':
      if (options.episodeNumber === undefined || options.pageNumber === undefined) {
        throw new Error('episodeNumber and pageNumber are required for layout file type')
      }
      return `${basePath}/episodes/${options.episodeNumber}/pages/${options.pageNumber}/layout.yaml`
    
    case 'preview':
      if (options.episodeNumber === undefined || options.pageNumber === undefined) {
        throw new Error('episodeNumber and pageNumber are required for preview file type')
      }
      return `${basePath}/episodes/${options.episodeNumber}/pages/${options.pageNumber}/preview.png`
    
    default:
      throw new Error(`Unknown file type: ${fileType}`)
  }
}

// バリデーション関数
export function validateNovel(data: unknown): Novel {
  return NovelSchema.parse(data)
}

export function validateJob(data: unknown): Job {
  return JobSchema.parse(data)
}

export function validateChunk(data: unknown): Chunk {
  return ChunkSchema.parse(data)
}

export function validateChunkAnalysis(data: unknown): ChunkAnalysis {
  return ChunkAnalysisSchema.parse(data)
}

export function validateNovelAnalysis(data: unknown): NovelAnalysis {
  return NovelAnalysisSchema.parse(data)
}

// ヘルパー関数
export function createNovel(
  id: string,
  title: string,
  totalLength: number
): Novel {
  const now = new Date()
  return {
    id,
    title,
    originalTextFile: getR2FilePath(id, 'original'),
    totalLength,
    createdAt: now,
    updatedAt: now
  }
}

export function createJob(novelId: string, totalChunks: number): Omit<Job, 'id'> {
  return {
    novelId,
    status: 'pending',
    progress: 0,
    totalChunks,
    processedChunks: 0
  }
}

export function createChunk(
  novelId: string,
  chunkIndex: number,
  startIndex: number,
  endIndex: number
): Omit<Chunk, 'id'> {
  return {
    novelId,
    chunkIndex,
    textFile: getR2FilePath(novelId, 'chunk', { chunkIndex }),
    startIndex,
    endIndex,
    status: 'pending'
  }
}

// 進捗計算ヘルパー
export function calculateProgress(processedChunks: number, totalChunks: number): number {
  if (totalChunks === 0) return 0
  return Math.round((processedChunks / totalChunks) * 100)
}