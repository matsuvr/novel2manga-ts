import { z } from 'zod'
import { SceneSchema } from '@/domain/models/scene'
export { SceneSchema }

// ========================================
// Status Types (設計書対応)
// ========================================

export const JobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'paused'])
export const JobStepSchema = z.enum([
  'initialized',
  'split',
  'analyze',
  'episode',
  'layout',
  'render',
  'complete',
])
export const StepStatusSchema = z.enum(['started', 'completed', 'failed', 'skipped'])
export const AnalysisStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])
export const LayoutStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])
export const RenderStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])

export type JobStatus = z.infer<typeof JobStatusSchema>
export type JobStep = z.infer<typeof JobStepSchema>
export type StepStatus = z.infer<typeof StepStatusSchema>
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>
export type LayoutStatus = z.infer<typeof LayoutStatusSchema>
export type RenderStatus = z.infer<typeof RenderStatusSchema>

// ========================================
// Core Models (設計書対応)
// ========================================

// Novel - 小説エンティティ（最上位）
export const NovelSchema = z.object({
  id: z.string(), // UUID
  title: z.string().optional(), // 小説タイトル
  author: z.string().optional(), // 著者名
  originalTextPath: z.string(), // ストレージ上のファイルパス
  textLength: z.number(), // 総文字数
  language: z.string(), // 言語コード
  metadataPath: z.string().optional(), // メタデータJSONパス
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Job - 変換ジョブ（Novelに対する処理単位）
export const JobSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  jobName: z.string().optional(), // ジョブ名

  // ステータス管理
  status: JobStatusSchema, // pending/processing/completed/failed/paused
  currentStep: JobStepSchema, // initialized/split/analyze/episode/layout/render/complete

  // 各ステップの完了状態
  splitCompleted: z.boolean(),
  analyzeCompleted: z.boolean(),
  episodeCompleted: z.boolean(),
  layoutCompleted: z.boolean(),
  renderCompleted: z.boolean(),

  // 各ステップの成果物パス（ディレクトリ）
  chunksDirPath: z.string().optional(), // チャンクファイルディレクトリ
  analysesDirPath: z.string().optional(), // 分析結果ディレクトリ
  episodesDataPath: z.string().optional(), // エピソード情報JSON
  layoutsDirPath: z.string().optional(), // レイアウトディレクトリ
  rendersDirPath: z.string().optional(), // 描画結果ディレクトリ

  // 進捗詳細
  totalChunks: z.number(),
  processedChunks: z.number(),
  totalEpisodes: z.number(),
  processedEpisodes: z.number(),
  totalPages: z.number(),
  renderedPages: z.number(),

  // エラー管理
  lastError: z.string().optional(),
  lastErrorStep: z.string().optional(),
  retryCount: z.number(),

  // 再開用の状態保存
  resumeDataPath: z.string().optional(), // 中断時の詳細状態JSONファイル

  // タイムスタンプ
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
})

// JobStepHistory - 各処理ステップの履歴
export const JobStepHistorySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stepName: JobStepSchema,
  status: StepStatusSchema, // started/completed/failed/skipped
  startedAt: z.date(),
  completedAt: z.date().optional(),
  durationSeconds: z.number().optional(),
  inputPath: z.string().optional(), // このステップへの入力
  outputPath: z.string().optional(), // このステップの出力
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional(), // JSON形式の追加情報
  createdAt: z.date(),
})

// Chunk - 分割されたテキストチャンク
export const ChunkSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  jobId: z.string(),
  chunkIndex: z.number(),
  contentPath: z.string(), // ストレージ上のチャンクファイルパス
  startPosition: z.number(), // テキスト内の開始位置
  endPosition: z.number(), // テキスト内の終了位置
  wordCount: z.number().optional(),
  createdAt: z.date(),
})

// ChunkAnalysisStatus - チャンク分析状態
export const ChunkAnalysisStatusSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  chunkIndex: z.number(),
  isAnalyzed: z.boolean(),
  analysisPath: z.string().optional(), // 分析結果ファイルパス
  analyzedAt: z.date().optional(),
  retryCount: z.number(),
  lastError: z.string().optional(),
  createdAt: z.date(),
})

// Episode - エピソード境界情報
export const EpisodeSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  jobId: z.string(),
  episodeNumber: z.number(),
  title: z.string().optional(),
  summary: z.string().optional(),
  startChunk: z.number(),
  startCharIndex: z.number(),
  endChunk: z.number(),
  endCharIndex: z.number(),
  estimatedPages: z.number(),
  confidence: z.number(),
  createdAt: z.date(),
})

// LayoutStatus - レイアウト生成状態
export const LayoutStatusModelSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  episodeNumber: z.number(),
  isGenerated: z.boolean(),
  layoutPath: z.string().optional(), // レイアウトYAMLパス
  totalPages: z.number().optional(),
  totalPanels: z.number().optional(),
  generatedAt: z.date().optional(),
  retryCount: z.number(),
  lastError: z.string().optional(),
  createdAt: z.date(),
})

// RenderStatus - 描画状態
export const RenderStatusModelSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  episodeNumber: z.number(),
  pageNumber: z.number(),
  isRendered: z.boolean(),
  imagePath: z.string().optional(), // 画像ファイルパス
  thumbnailPath: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fileSize: z.number().optional(),
  renderedAt: z.date().optional(),
  retryCount: z.number(),
  lastError: z.string().optional(),
  createdAt: z.date(),
})

// Output - 最終成果物
export const OutputSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  jobId: z.string(),
  outputType: z.enum(['pdf', 'cbz', 'images_zip', 'epub']),
  outputPath: z.string(),
  fileSize: z.number().optional(),
  pageCount: z.number().optional(),
  metadataPath: z.string().optional(),
  createdAt: z.date(),
})

// StorageFile - ファイル管理
export const StorageFileSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  jobId: z.string().optional(),
  filePath: z.string(),
  fileCategory: z.enum([
    'original',
    'chunk',
    'analysis',
    'episode',
    'layout',
    'render',
    'output',
    'metadata',
  ]),
  fileType: z.enum(['txt', 'json', 'yaml', 'png', 'jpg', 'pdf', 'zip']),
  fileSize: z.number().optional(),
  createdAt: z.date(),
})

// ========================================
// Content Models (R2に保存される詳細データ)
// ========================================

// Character - 登場人物
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  firstAppearance: z.number(),
})

// SceneSchema は domain/models/scene.ts の統一定義を利用

// Dialogue - 対話
export const DialogueSchema = z.object({
  id: z.string(),
  speakerId: z.string(),
  text: z.string(),
  emotion: z.string().optional(),
  index: z.number(),
})

// Highlight - ハイライト
export const HighlightSchema = z.object({
  id: z.string(),
  type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
  description: z.string(),
  importance: z.number().min(1).max(5), // 1-5
  startIndex: z.number(),
  endIndex: z.number(),
})

// Situation - 状況
export const SituationSchema = z.object({
  id: z.string(),
  description: z.string(),
  index: z.number(),
})

// TextAnalysis - 5要素の詳細（R2に保存）
export const TextAnalysisSchema = z.object({
  chunkId: z.string().optional(), // ChunkAnalysisの場合
  characters: z.array(CharacterSchema), // 登場人物
  scenes: z.array(SceneSchema), // シーン
  dialogues: z.array(DialogueSchema), // 対話
  highlights: z.array(HighlightSchema), // ハイライト
  situations: z.array(SituationSchema), // 状況
  metadata: z
    .object({
      chunkIndex: z.number().optional(),
      totalChunks: z.number().optional(),
      previousChunkText: z.string().optional(),
      nextChunkText: z.string().optional(),
    })
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// CachedAnalysisResult - キャッシュされた分析結果
export const CachedAnalysisResultSchema = z.object({
  result: TextAnalysisSchema,
  timestamp: z.number(),
  ttl: z.number().optional(),
})

// ========================================
// TypeScript Type Definitions
// ========================================

export type Novel = z.infer<typeof NovelSchema>
export type Job = z.infer<typeof JobSchema>
export type JobStepHistory = z.infer<typeof JobStepHistorySchema>
export type Chunk = z.infer<typeof ChunkSchema>
export type ChunkAnalysisStatus = z.infer<typeof ChunkAnalysisStatusSchema>
export type Episode = z.infer<typeof EpisodeSchema>
export type LayoutStatusModel = z.infer<typeof LayoutStatusModelSchema>
export type RenderStatusModel = z.infer<typeof RenderStatusModelSchema>
export type Output = z.infer<typeof OutputSchema>
export type StorageFile = z.infer<typeof StorageFileSchema>

export type Character = z.infer<typeof CharacterSchema>
export type Scene = z.infer<typeof SceneSchema>
export type Dialogue = z.infer<typeof DialogueSchema>
export type Highlight = z.infer<typeof HighlightSchema>
export type Situation = z.infer<typeof SituationSchema>
export type TextAnalysis = z.infer<typeof TextAnalysisSchema>
export type CachedAnalysisResult = z.infer<typeof CachedAnalysisResultSchema>

// ========================================
// Progress and Extended Types
// ========================================

// JobProgress - ジョブ進捗情報
export interface JobProgress {
  jobId: string
  status: JobStatus
  currentStep: JobStep
  progress: number // 0-100

  // ステップ別進捗
  stepProgress: {
    split: { completed: boolean; progress: number }
    analyze: { completed: boolean; progress: number }
    episode: { completed: boolean; progress: number }
    layout: { completed: boolean; progress: number }
    render: { completed: boolean; progress: number }
  }

  // 詳細統計
  stats: {
    totalChunks: number
    processedChunks: number
    totalEpisodes: number
    processedEpisodes: number
    totalPages: number
    renderedPages: number
  }

  // エラー情報
  error?: {
    message: string
    step: string
    retryCount: number
  }

  // タイムスタンプ
  startedAt?: Date
  estimatedCompletion?: Date
  updatedAt: Date
}

// ExtendedJob - Job + Novel情報
export interface ExtendedJob extends Job {
  novel: Novel
  progress: JobProgress
  stepHistory: JobStepHistory[]
}

// ========================================
// Helper Functions
// ========================================

// バリデーション関数
export function validateNovel(data: unknown): Novel {
  return NovelSchema.parse(data)
}

export function validateJob(data: unknown): Job {
  return JobSchema.parse(data)
}

export function validateJobStepHistory(data: unknown): JobStepHistory {
  return JobStepHistorySchema.parse(data)
}

export function validateChunk(data: unknown): Chunk {
  return ChunkSchema.parse(data)
}

export function validateChunkAnalysisStatus(data: unknown): ChunkAnalysisStatus {
  return ChunkAnalysisStatusSchema.parse(data)
}

export function validateEpisode(data: unknown): Episode {
  return EpisodeSchema.parse(data)
}

export function validateLayoutStatus(data: unknown): LayoutStatusModel {
  return LayoutStatusModelSchema.parse(data)
}

export function validateRenderStatus(data: unknown): RenderStatusModel {
  return RenderStatusModelSchema.parse(data)
}

export function validateOutput(data: unknown): Output {
  return OutputSchema.parse(data)
}

export function validateStorageFile(data: unknown): StorageFile {
  return StorageFileSchema.parse(data)
}

export function validateTextAnalysis(data: unknown): TextAnalysis {
  return TextAnalysisSchema.parse(data)
}

// ヘルパー関数
export function createNovel(
  id: string,
  originalTextPath: string,
  textLength: number,
  language: string = 'ja',
  title?: string,
  author?: string,
): Novel {
  const now = new Date()
  return {
    id,
    title,
    author,
    originalTextPath,
    textLength,
    language,
    createdAt: now,
    updatedAt: now,
  }
}

// Removed deprecated createJob(id, novelId, jobName?) helper in favor of DatabaseService.createJob

export function createChunk(
  id: string,
  novelId: string,
  jobId: string,
  chunkIndex: number,
  contentPath: string,
  startPosition: number,
  endPosition: number,
  wordCount?: number,
): Chunk {
  return {
    id,
    novelId,
    jobId,
    chunkIndex,
    contentPath,
    startPosition,
    endPosition,
    wordCount,
    createdAt: new Date(),
  }
}

export function createJobStepHistory(
  id: string,
  jobId: string,
  stepName: JobStep,
  status: StepStatus,
  startedAt: Date,
  completedAt?: Date,
  errorMessage?: string,
  inputPath?: string,
  outputPath?: string,
  metadata?: Record<string, unknown>,
): JobStepHistory {
  const durationSeconds = completedAt
    ? Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000)
    : undefined

  return {
    id,
    jobId,
    stepName,
    status,
    startedAt,
    completedAt,
    durationSeconds,
    inputPath,
    outputPath,
    errorMessage,
    metadata,
    createdAt: new Date(),
  }
}

// 進捗計算ヘルパー
export function calculateJobProgress(job: Job): number {
  const stepWeights = {
    split: 0.1, // 10%
    analyze: 0.4, // 40%
    episode: 0.1, // 10%
    layout: 0.2, // 20%
    render: 0.2, // 20%
  }

  let totalProgress = 0

  if (job.splitCompleted) totalProgress += stepWeights.split
  if (job.analyzeCompleted) totalProgress += stepWeights.analyze
  if (job.episodeCompleted) totalProgress += stepWeights.episode
  if (job.layoutCompleted) totalProgress += stepWeights.layout
  if (job.renderCompleted) totalProgress += stepWeights.render

  // 現在のステップの進捗を追加
  if (!job.splitCompleted && job.currentStep === 'split') {
    // 分割中の場合、進捗はファイル処理ベース
    totalProgress += stepWeights.split * 0.5 // 仮の進捗
  } else if (!job.analyzeCompleted && job.currentStep === 'analyze') {
    // 分析中の場合
    const chunkProgress = job.totalChunks > 0 ? job.processedChunks / job.totalChunks : 0
    totalProgress += stepWeights.analyze * chunkProgress
  } else if (!job.renderCompleted && job.currentStep === 'render') {
    // レンダリング中の場合
    const renderProgress = job.totalPages > 0 ? job.renderedPages / job.totalPages : 0
    totalProgress += stepWeights.render * renderProgress
  }

  return Math.round(totalProgress * 100)
}

export function createJobProgress(job: Job): JobProgress {
  const progress = calculateJobProgress(job)

  return {
    jobId: job.id,
    status: job.status,
    currentStep: job.currentStep,
    progress,
    stepProgress: {
      split: {
        completed: job.splitCompleted,
        progress: job.splitCompleted ? 100 : job.currentStep === 'split' ? 50 : 0,
      },
      analyze: {
        completed: job.analyzeCompleted,
        progress: job.analyzeCompleted
          ? 100
          : job.totalChunks > 0
            ? Math.round((job.processedChunks / job.totalChunks) * 100)
            : 0,
      },
      episode: {
        completed: job.episodeCompleted,
        progress: job.episodeCompleted ? 100 : job.currentStep === 'episode' ? 50 : 0,
      },
      layout: {
        completed: job.layoutCompleted,
        progress: job.layoutCompleted
          ? 100
          : job.totalEpisodes > 0
            ? Math.round((job.processedEpisodes / job.totalEpisodes) * 100)
            : 0,
      },
      render: {
        completed: job.renderCompleted,
        progress: job.renderCompleted
          ? 100
          : job.totalPages > 0
            ? Math.round((job.renderedPages / job.totalPages) * 100)
            : 0,
      },
    },
    stats: {
      totalChunks: job.totalChunks,
      processedChunks: job.processedChunks,
      totalEpisodes: job.totalEpisodes,
      processedEpisodes: job.processedEpisodes,
      totalPages: job.totalPages,
      renderedPages: job.renderedPages,
    },
    error: job.lastError
      ? {
          message: job.lastError,
          step: job.lastErrorStep || job.currentStep,
          retryCount: job.retryCount,
        }
      : undefined,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  }
}
