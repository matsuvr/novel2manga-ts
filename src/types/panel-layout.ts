// パネルレイアウトのYAML構造に対応する型定義

export interface MangaLayout {
  title: string
  author?: string
  created_at: string
  episodeNumber: number
  episodeTitle?: string
  pages: Page[]
}

export interface Page {
  page_number: number
  panels: Panel[]
}

export interface Panel {
  id: number | string
  position: Position
  size: Size
  content: string
  dialogues?: Dialogue[]
  sourceChunkIndex?: number // このパネルの元となったチャンクのインデックス
  importance?: number // ハイライトシーンの重要度 (1-10)
}

export interface Position {
  x: number // 0.0 - 1.0 (0が右端、1が左端)
  y: number // 0.0 - 1.0 (0が上端、1が下端)
}

export interface Size {
  width: number // 0.0 - 1.0
  height: number // 0.0 - 1.0
}

export interface Dialogue {
  emotion?: string
  speaker: string
  text: string
}

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
  estimatedPages: number
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
}

export interface Character {
  name: string
  role: string
  description: string
}

import type { Scene } from '@/domain/models/scene'

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
