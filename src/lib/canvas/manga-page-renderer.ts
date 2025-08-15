import { appConfig } from '@/config/app.config'
import { normalizeEmotion } from '@/domain/models/emotion'
import type {
  ChunkAnalysisResult,
  Dialogue,
  DialogueElement,
  EpisodeData,
  MangaLayout,
  Page,
  Panel,
} from '@/types/panel-layout'
import { CanvasRenderer, type NodeCanvas } from './canvas-renderer'
import { PanelLayoutEngine } from './panel-layout-engine'
import { SpeechBubblePlacer } from './speech-bubble-placer'

export interface MangaPageRendererConfig {
  pageWidth: number
  pageHeight: number
  margin: number
  panelSpacing: number
  defaultFont: string
  fontSize: number
}

export class MangaPageRenderer {
  private config: MangaPageRendererConfig
  private canvasRenderer: CanvasRenderer
  private layoutEngine: PanelLayoutEngine
  private bubblePlacer: SpeechBubblePlacer

  constructor(config?: Partial<MangaPageRendererConfig>) {
    this.config = {
      pageWidth: appConfig.rendering.defaultPageSize.width,
      pageHeight: appConfig.rendering.defaultPageSize.height,
      margin: 20,
      panelSpacing: 10,
      defaultFont: 'sans-serif',
      fontSize: 14,
      ...config,
    }

    this.canvasRenderer = new CanvasRenderer({
      width: this.config.pageWidth,
      height: this.config.pageHeight,
      font: this.config.defaultFont,
      defaultFontSize: this.config.fontSize,
    })

    this.layoutEngine = new PanelLayoutEngine({
      margin: this.config.margin,
      panelSpacing: this.config.panelSpacing,
    })

    this.bubblePlacer = new SpeechBubblePlacer()
  }

  /**
   * エピソードデータから完全なマンガレイアウトを生成
   */
  async generateMangaLayout(episodeData: EpisodeData): Promise<MangaLayout> {
    // チャンク分析結果をページに分割
    const pages = this.layoutEngine.divideIntoPages(episodeData.chunkAnalyses)

    // マンガレイアウトの構築
    const mangaLayout: MangaLayout = {
      title: episodeData.title || `Episode ${episodeData.episodeNumber}`,
      author: episodeData.author,
      created_at: new Date().toISOString(),
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.title,
      pages: [],
    }

    // 各ページのレイアウトを生成
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const pageChunks = pages[pageIndex]
      const panels = await this.createPanelsFromChunks(pageChunks, pageIndex)

      const page: Page = {
        page_number: pageIndex + 1,
        panels,
      }

      mangaLayout.pages.push(page)
    }

    return mangaLayout
  }

  /**
   * チャンク分析結果からパネルを生成
   */
  private async createPanelsFromChunks(
    chunks: ChunkAnalysisResult[],
    pageIndex: number,
  ): Promise<Panel[]> {
    // パネルレイアウトを計算
    const panelLayouts = this.layoutEngine.calculatePanelLayout(chunks)

    const panels: Panel[] = []
    let panelId = pageIndex * 100 + 1 // ページごとにIDを管理

    for (let i = 0; i < panelLayouts.length; i++) {
      const layout = panelLayouts[i]
      const chunk = chunks[i]

      // シーンの状況説明を構築
      const content = this.buildPanelContent(chunk)

      // 対話の配置を計算
      // Chunk の dialogues は DialogueElement[] (emotion: string) なので描画用 Dialogue[] に正規化
      const normalizedDialogues: Dialogue[] = (chunk.dialogues || []).map(
        (d: DialogueElement): Dialogue => ({
          speaker: d.speaker,
          text: d.text,
          emotion: normalizeEmotion(d.emotion),
        }),
      )
      const dialogues = this.bubblePlacer.placeDialogues(normalizedDialogues, layout)

      const panel: Panel = {
        id: panelId++,
        position: layout.position,
        size: layout.size,
        content,
        dialogues,
        sourceChunkIndex: chunk.chunkIndex,
        importance: this.calculateImportance(chunk),
      }

      panels.push(panel)
    }

    return panels
  }

  /**
   * チャンクからパネルのコンテンツ（状況説明）を構築
   */
  private buildPanelContent(chunk: ChunkAnalysisResult): string {
    const contents: string[] = []

    // シーン情報
    if (chunk.scenes && chunk.scenes.length > 0) {
      const scene = chunk.scenes[0]
      if (scene.location) {
        contents.push(`場所: ${scene.location}`)
      }
      if (scene.time) {
        contents.push(`時間: ${scene.time}`)
      }
    }

    // 状況説明
    if (chunk.situations && chunk.situations.length > 0) {
      contents.push(chunk.situations[0].description)
    }

    // ハイライトシーン
    if (chunk.highlights && chunk.highlights.length > 0) {
      const highlight = chunk.highlights[0]
      if (highlight.type === 'action_sequence') {
        contents.push(`【アクション】${highlight.description}`)
      } else if (highlight.type === 'emotional_peak') {
        contents.push(`【感情】${highlight.description}`)
      }
    }

    return contents.join('\n')
  }

  /**
   * チャンクの重要度を計算
   */
  private calculateImportance(chunk: ChunkAnalysisResult): number {
    let importance = 5 // デフォルト中程度

    // ハイライトがある場合は重要度を上げる
    if (chunk.highlights && chunk.highlights.length > 0) {
      const maxImportance = Math.max(...chunk.highlights.map((h) => h.importance || 5))
      importance = Math.max(importance, maxImportance)
    }

    // 対話が多い場合も重要度を上げる
    if (chunk.dialogues && chunk.dialogues.length > 5) {
      importance = Math.max(importance, 7)
    }

    return Math.min(importance, 10)
  }

  /**
   * マンガレイアウトをCanvasに描画
   */
  async renderToCanvas(
    layout: MangaLayout,
    pageNumber: number = 1,
  ): Promise<HTMLCanvasElement | NodeCanvas> {
    const page = layout.pages.find((p) => p.page_number === pageNumber)
    if (!page) {
      throw new Error(`Page ${pageNumber} not found`)
    }

    // ページ単位のレイアウトを描画
    const pageLayout: MangaLayout = {
      ...layout,
      pages: [page],
    }

    this.canvasRenderer.renderMangaLayout(pageLayout)
    return this.canvasRenderer.canvas
  }

  /**
   * マンガレイアウトを画像として出力
   */
  async renderToImage(
    layout: MangaLayout,
    pageNumber: number = 1,
    format: 'png' | 'jpeg' | 'webp' = 'png',
  ): Promise<Blob> {
    await this.renderToCanvas(layout, pageNumber)
    return this.canvasRenderer.toBlob(format)
  }

  /**
   * 全ページを一括でレンダリング
   */
  async renderAllPages(
    layout: MangaLayout,
    format: 'png' | 'jpeg' | 'webp' = 'png',
  ): Promise<Blob[]> {
    const renderedPages: Blob[] = []

    for (const page of layout.pages) {
      const blob = await this.renderToImage(layout, page.page_number, format)
      renderedPages.push(blob)
    }

    return renderedPages
  }

  /**
   * Clean up canvas resources to prevent memory leaks
   */
  cleanup(): void {
    this.canvasRenderer.cleanup()
  }
}
