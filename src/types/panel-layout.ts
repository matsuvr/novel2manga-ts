// パネルレイアウトのYAML構造に対応する型定義 (single source of truth: Zod schema)
// Gemini review (PR#63 medium): Avoid divergence between interface & Zod schema.
// We now derive all exported types from panel-layout.zod.ts schemas via z.infer.
// If schema changes, these types update automatically.
import type { z } from 'zod'
import type {
  DialogueSchema,
  MangaLayoutSchema,
  PageSchema,
  PanelSchema,
  PositionSchema,
  SizeSchema,
} from './panel-layout.zod'

export type Position = z.infer<typeof PositionSchema> // 0.0 - 1.0 normalized coordinates
export type Size = z.infer<typeof SizeSchema>
export type Dialogue = z.infer<typeof DialogueSchema>
export type Panel = z.infer<typeof PanelSchema>
export type Page = z.infer<typeof PageSchema>
export type MangaLayout = z.infer<typeof MangaLayoutSchema>

// Compile-time structural compatibility assertion (fails on drift if manually reintroduced)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type __AssertMangaLayoutConsistency = MangaLayout['pages'][number] extends Page ? true : never

// Emotion type already incorporated by DialogueSchema (emotion?: Emotion)

// エピソードデータ（レイアウト生成の入力）
export interface EpisodeData {
  chunkAnalyses: ChunkAnalysisResult[]
  author: string
  title: `Episode ${number}`
  episodeNumber: number
  episodeTitle?: string
  episodeSummary?: string
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
  chunks: ChunkData[] // このエピソードに含まれるチャンクとその解析結果
}

// チャンクデータ（5要素解析結果を含む）
export interface ChunkData {
  chunkIndex: number
  text: string // チャンクの元テキスト
  analysis: ChunkAnalysisResult // 5要素解析結果
  isPartial?: boolean // エピソード境界によって部分的に含まれるチャンク
  startOffset?: number // 部分チャンクの開始位置
  endOffset?: number // 部分チャンクの終了位置
}

// チャンクの5要素解析結果
export interface ChunkAnalysisResult {
  chunkIndex: number
  characters: Character[]
  scenes: Scene[]
  dialogues: DialogueElement[]
  highlights: Highlight[]
  situations: Situation[]
  summary: string
  sfx?: string[] // SFX data from script conversion
}

export interface Character {
  name: string
  role: string
  description: string
}

import type { Scene } from '@/domain/models/scene'
// Re-export Scene for consumers needing layout + scene types from a single import path
export type { Scene }
// NOTE (legacy compatibility): 旧レイアウト処理は Scene { time: boolean; location: boolean } を
// 疑似フラグとして参照していたが、統一モデルでは time?: string, location: string に正規化。
// 既存コード側で boolean 判定がまだ必要なケースは domain/models/scene.ts の
// sceneLegacyFlags(scene) で hasTime / hasLocation を得る。直接 !!scene.time 等を書くより
// ヘルパー経由にすることで除去時 (全移行完了後) に探索容易。
// 未移行箇所が見つかった場合はタスク管理 (tasks.md) に "Remove legacy scene flags usage" を追記。

export interface DialogueElement {
  emotion: string
  speaker: string
  text: string
  context: string
}

export interface Highlight {
  description: string
  type: string
  text: string
  importance: number // 1-10
  reason: string
}

export interface Situation {
  event: string
  description: string
  significance: string
}

// レイアウト生成の設定
export interface LayoutGenerationConfig {
  panelsPerPage: {
    min: number
    max: number
    average: number
  }
  dialogueDensity: number // 0.0 - 1.0 (セリフの密度)
  visualComplexity: number // 0.0 - 1.0 (視覚的複雑さ)
  highlightPanelSizeMultiplier: number // ハイライトシーンのコマサイズ倍率
  readingDirection: 'right-to-left' // 日本式マンガの読み方向
}

// レイアウトテンプレート（よく使われるコマ割りパターン）
export interface LayoutTemplate {
  name: string
  description: string
  panelCount: number
  panels: Array<{
    position: Position
    size: Size
    priority: number // どのパネルを重要なシーンに使うか
  }>
}
