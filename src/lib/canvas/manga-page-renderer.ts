import { appConfig } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { renderVerticalTextBatch } from '@/services/vertical-text-client'
import type {
  ChunkAnalysisResult,
  Dialogue,
  DialogueElement,
  EpisodeData,
  MangaLayout,
  Page,
  Panel,
} from '@/types/panel-layout'
import { getFontForDialogue, type VerticalTextRenderRequest } from '@/types/vertical-text'
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
  private canvasRenderer!: CanvasRenderer
  private layoutEngine: PanelLayoutEngine
  private bubblePlacer: SpeechBubblePlacer

  // Async factory method for proper canvas initialization
  static async create(config?: Partial<MangaPageRendererConfig>): Promise<MangaPageRenderer> {
    const renderer = new MangaPageRenderer(config, true)
    await renderer.initializeAsync()
    return renderer
  }

  constructor(config?: Partial<MangaPageRendererConfig>, skipAsyncInit: boolean = false) {
    this.config = {
      pageWidth: appConfig.rendering.defaultPageSize.width,
      pageHeight: appConfig.rendering.defaultPageSize.height,
      margin: 20,
      panelSpacing: 10,
      defaultFont: 'sans-serif',
      fontSize: 14,
      ...config,
    }

    this.layoutEngine = new PanelLayoutEngine({
      margin: this.config.margin,
      panelSpacing: this.config.panelSpacing,
    })

    this.bubblePlacer = new SpeechBubblePlacer()

    if (!skipAsyncInit) {
      // For tests - use a synchronous mock canvas renderer
      // This will be overridden by the mock in tests
      this.canvasRenderer = null as unknown as CanvasRenderer
    }
  }

  // Public accessors for page dimensions (avoid exposing private config object)
  get pageWidth(): number {
    return this.config.pageWidth
  }
  get pageHeight(): number {
    return this.config.pageHeight
  }

  private async initializeAsync() {
    this.canvasRenderer = await CanvasRenderer.create({
      width: this.config.pageWidth,
      height: this.config.pageHeight,
      font: this.config.defaultFont,
      defaultFontSize: this.config.fontSize,
    })
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
    // --- DEBUG LOG ---
    console.log(
      `[MangaPageRenderer] Creating panels for page ${pageIndex}. Received ${chunks.length} chunks.`,
    )
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(
        `Chunk ${i}:`,
        JSON.stringify(
          {
            chunkIndex: chunk.chunkIndex,
            dialoguesCount: (chunk.dialogues || []).length,
            situationsCount: (chunk.situations || []).length,
            highlightsCount: (chunk.highlights || []).length,
            scenesCount: (chunk.scenes || []).length,
          },
          null,
          2,
        ),
      )
    }
    // --- END DEBUG LOG ---

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
          emotion: d.emotion,
          ...(d.type ? { type: d.type } : {}),
        }),
      )
      const dialogues = this.bubblePlacer.placeDialogues(normalizedDialogues, layout)

      const panel: Panel = {
        id: panelId++,
        position: layout.position,
        size: layout.size,
        content,
        dialogues,
        sfx: chunk.sfx, // Add SFX data from chunk analysis
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
   * パネルの縦幅比率から、縦書きAPIへ渡す1行最大文字数を算出
   * - height <= 0.2: 6文字
   * - height <= 0.3: 8文字
   * - otherwise: 設定のデフォルト値
   */
  private computeMaxCharsPerLine(panelHeightRatio: number): number {
    const defaults = appConfig.rendering.verticalText.defaults
    if (panelHeightRatio <= 0.2) return 6
    if (panelHeightRatio <= 0.3) return 8
    return defaults.maxCharsPerLine
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

    // 縦書きセリフ画像の事前生成（API統合）
    await this.prepareAndAttachDialogueAssets(pageLayout)

    this.canvasRenderer.renderMangaLayout(pageLayout)
    return this.canvasRenderer.canvas
  }

  /**
   * ページ内の全Dialogueについて縦書き画像を取得し、CanvasRendererにアセットを設定
   *
   * フォールバックは実装しない（失敗時はエラーで停止）
   * Rationale: 本システムは一気通貫の分析サービスであり、フォールバック実装により
   * 正常な分析結果が得られないことは重要な欠陥である（CLAUDE.md参照）。
   * エラーは詳細なメッセージと共に明示し、処理をストップする設計とする。
   */
  private async prepareAndAttachDialogueAssets(layout: MangaLayout): Promise<void> {
    const logger = getLogger().withContext({
      service: 'MangaPageRenderer',
      method: 'prepareAndAttachDialogueAssets',
    })

    const feature = appConfig.rendering.verticalText
    if (!feature?.enabled) {
      const error = 'Vertical text rendering is disabled by configuration'
      logger.error(error, { feature })
      throw new Error(error)
    }

    logger.info('Starting dialogue assets preparation', {
      pagesCount: layout.pages.length,
      verticalTextConfig: feature,
    })

    const page = layout.pages[0]
    const assets: Record<string, { image: unknown; width: number; height: number }> = {}

    const isTest = process.env.NODE_ENV === 'test'
    let totalDialogues = 0
    let processedDialogues = 0

    // Count total dialogues for progress tracking
    for (const panel of page.panels) {
      totalDialogues += (panel.dialogues || []).length
    }

    logger.info('Processing dialogues', { totalDialogues, isTest })

    if (isTest) {
      // 既存挙動: テスト時はネットワークを使わず擬似サイズで資産化
      for (const panel of page.panels) {
        const dialogues = panel.dialogues || []
        const panelHeightRatio = panel.size.height
        const maxCharsForPanel = this.computeMaxCharsPerLine(panelHeightRatio)
        for (let i = 0; i < dialogues.length; i++) {
          const d = dialogues[i]
          const cleanedText = this.extractDialogueText(d.text)
          const w = feature.defaults.fontSize + feature.defaults.padding * 2
          const h = Math.max(40, Math.ceil(cleanedText.length * (feature.defaults.fontSize * 0.9)))
          const key = `${panel.id}:${i}`
          assets[key] = { image: { __test_placeholder: true }, width: w, height: h }
          processedDialogues++
          logger.debug('Created test placeholder', {
            panelId: panel.id,
            dialogueIndex: i,
            text: cleanedText,
            maxCharsForPanel,
          })
        }
      }
    } else {
      // 本番/開発: ページ単位でbatch APIをコール
      type MapEntry = { key: string; panelId: string | number; dialogueIndex: number; text: string }
      const items: VerticalTextRenderRequest[] = []
      const map: MapEntry[] = []
      for (const panel of page.panels) {
        const panelHeightRatio = panel.size.height
        const maxCharsForPanel = this.computeMaxCharsPerLine(panelHeightRatio)
        const dialogues = panel.dialogues || []
        for (let i = 0; i < dialogues.length; i++) {
          const d = dialogues[i]
          const cleanedText = this.extractDialogueText(d.text)
          const selectedFont = getFontForDialogue(d)
          items.push({
            text: cleanedText,
            font: selectedFont,
            maxCharsPerLine: maxCharsForPanel,
          })
          map.push({
            key: `${panel.id}:${i}`,
            panelId: panel.id,
            dialogueIndex: i,
            text: cleanedText,
          })
        }
      }

      if (items.length > 0) {
        logger.debug('Calling vertical text batch API', {
          count: items.length,
          defaults: {
            fontSize: feature.defaults.fontSize,
            lineHeight: feature.defaults.lineHeight,
            letterSpacing: feature.defaults.letterSpacing,
            padding: feature.defaults.padding,
          },
        })

        // API 仕様上、items は最大 50 件の制限があるため分割して実行
        const BATCH_LIMIT = 50 as const
        const defaults = {
          fontSize: feature.defaults.fontSize,
          lineHeight: feature.defaults.lineHeight,
          letterSpacing: feature.defaults.letterSpacing,
          padding: feature.defaults.padding,
        }

        const allResults: Array<{ meta: { width: number; height: number }; pngBuffer: Buffer }> = []
        let offset = 0
        while (offset < items.length) {
          const slice = items.slice(offset, offset + BATCH_LIMIT)
          const apiStartTime = Date.now()
          const res = await renderVerticalTextBatch({ defaults, items: slice })
          const apiDuration = Date.now() - apiStartTime
          logger.debug('Vertical text batch API completed (chunk)', {
            duration: apiDuration,
            chunkStart: offset,
            chunkSize: slice.length,
            results: res.length,
          })
          if (res.length !== slice.length) {
            throw new Error(
              `vertical-text batch size mismatch: requested ${slice.length}, got ${res.length} (offset ${offset})`,
            )
          }
          allResults.push(...res)
          offset += BATCH_LIMIT
        }

        if (allResults.length !== items.length) {
          throw new Error(
            `vertical-text batch size mismatch: requested ${items.length}, got ${allResults.length}`,
          )
        }

        for (let idx = 0; idx < allResults.length; idx++) {
          const { meta, pngBuffer } = allResults[idx]
          const { key, panelId, dialogueIndex } = map[idx]

          if (typeof CanvasRenderer.createImageFromBuffer !== 'function') {
            const error = 'Canvas image creation not available'
            logger.error(error, {
              panelId,
              dialogueIndex,
              createImageFromBufferType: typeof CanvasRenderer.createImageFromBuffer,
            })
            throw new Error(error)
          }

          const created = CanvasRenderer.createImageFromBuffer(pngBuffer)
          const w = Math.max(1, created.width || meta.width)
          const h = Math.max(1, created.height || meta.height)
          assets[key] = { image: created.image, width: w, height: h }
          processedDialogues++

          logger.debug('Dialogue asset created (batch)', {
            key,
            width: w,
            height: h,
            progress: `${processedDialogues}/${totalDialogues}`,
          })
        }
      }
    }

    logger.info('Dialogue assets preparation completed', {
      totalAssets: Object.keys(assets).length,
      processedDialogues,
      totalDialogues,
    })

    this.canvasRenderer.setDialogueAssets(assets)
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

  /**
   * セリフテキストから話者部分を除去し、最初と最後のカギ括弧を取り除く
   * 例: 「太郎：「こんにちは」」または「「こんにちは」」→「こんにちは」
   */
  /**
   * セリフテキストから話者部分を除去し、最初と最後のカギ括弧を取り除く
   * 例: 「太郎：「こんにちは」」または「「こんにちは」」→「こんにちは」
   */
  private extractDialogueText(text: string): string {
    let cleanedText = text

    // 話者部分の除去 (全角コロンと半角コロンの両方に対応)
    const speakerPattern = /^(.+?)[：:](.+)$/
    const match = cleanedText.match(speakerPattern)
    if (match) {
      cleanedText = match[2].trim()
    }

    // 外側のカギ括弧のみ除去（内側は保持）
    cleanedText = this.removeOuterQuotes(cleanedText)

    return cleanedText
  }

  /**
   * テキストの最初と最後にあるカギ括弧を除去（「」/『』/""/''）
   * 文中のカギ括弧は保持
   */
  private removeOuterQuotes(text: string): string {
    let result = text.trim()

    if (result.length >= 2) {
      if (result.startsWith('「') && result.endsWith('」')) {
        result = result.slice(1, -1)
      } else if (result.startsWith('『') && result.endsWith('』')) {
        result = result.slice(1, -1)
      } else if (result.startsWith('"') && result.endsWith('"')) {
        result = result.slice(1, -1)
      } else if (result.startsWith("'") && result.endsWith("'")) {
        result = result.slice(1, -1)
      }
    }

    return result.trim()
  }
}
