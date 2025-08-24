import { appConfig } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { renderVerticalText } from '@/services/vertical-text-client'
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
    const logger = getLogger().withContext({ component: 'MangaPageRenderer' })
    logger.info('Creating panels for page', {
      pageIndex,
      chunksCount: chunks.length,
    })

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
    // Helper: timeout wrapper to avoid silent hangs on external API/canvas
    const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      let timer: NodeJS.Timeout | null = null
      try {
        return await Promise.race<Promise<T>>([
          p,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
          }) as Promise<T>,
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    for (const panel of page.panels) {
      totalDialogues += (panel.dialogues || []).length
    }

    logger.info('Processing dialogues', { totalDialogues, isTest })

    for (const panel of page.panels) {
      const dialogues = panel.dialogues || []
      for (let i = 0; i < dialogues.length; i++) {
        const d = dialogues[i]
        let imageObj: unknown
        let w = 1
        let h = 1

        try {
          if (isTest) {
            // In unit tests, avoid network. Provide deterministic placeholder sizes.
            w = feature.defaults.fontSize + feature.defaults.padding * 2
            h = Math.max(40, Math.ceil(d.text.length * (feature.defaults.fontSize * 0.9)))
            imageObj = { __test_placeholder: true }
            logger.debug('Created test placeholder', {
              panelId: panel.id,
              dialogueIndex: i,
              text: d.text,
            })
          } else {
            // API コール
            logger.debug('Calling vertical text API', {
              panelId: panel.id,
              dialogueIndex: i,
              text: d.text,
              apiParams: {
                fontSize: feature.defaults.fontSize,
                lineHeight: feature.defaults.lineHeight,
                letterSpacing: feature.defaults.letterSpacing,
                padding: feature.defaults.padding,
                maxCharsPerLine: feature.defaults.maxCharsPerLine,
              },
            })

            const apiStartTime = Date.now()
            const { meta, pngBuffer } = await withTimeout(
              renderVerticalText({
                text: d.text,
                fontSize: feature.defaults.fontSize,
                lineHeight: feature.defaults.lineHeight,
                letterSpacing: feature.defaults.letterSpacing,
                padding: feature.defaults.padding,
                maxCharsPerLine: feature.defaults.maxCharsPerLine,
              }),
              20000,
              'Vertical text API call',
            )
            const apiDuration = Date.now() - apiStartTime

            logger.debug('Vertical text API call completed', {
              panelId: panel.id,
              dialogueIndex: i,
              duration: apiDuration,
              metaWidth: meta.width,
              metaHeight: meta.height,
              bufferSize: pngBuffer.length,
            })

            // node-canvas Image 作成
            if (typeof CanvasRenderer.createImageFromBuffer === 'function') {
              const created = await withTimeout(
                Promise.resolve(CanvasRenderer.createImageFromBuffer(pngBuffer)),
                5000,
                'Canvas image creation',
              )
              imageObj = created.image
              w = Math.max(1, created.width || meta.width)
              h = Math.max(1, created.height || meta.height)

              logger.debug('Canvas image created', {
                panelId: panel.id,
                dialogueIndex: i,
                finalWidth: w,
                finalHeight: h,
              })
            } else {
              // 非想定だが、型の都合でnode-canvasへ到達できない場合
              const error = 'Canvas image creation not available'
              logger.error(error, {
                panelId: panel.id,
                dialogueIndex: i,
                createImageFromBufferType: typeof CanvasRenderer.createImageFromBuffer,
              })
              throw new Error(error)
            }
          }

          const key = `${panel.id}:${i}`
          assets[key] = { image: imageObj, width: w, height: h }
          processedDialogues++

          logger.debug('Dialogue asset created', {
            key,
            width: w,
            height: h,
            progress: `${processedDialogues}/${totalDialogues}`,
          })
        } catch (error: unknown) {
          logger.error('Failed to create dialogue asset', {
            panelId: panel.id,
            dialogueIndex: i,
            text: d.text,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            stack: error instanceof Error ? error.stack : undefined,
            progress: `${processedDialogues}/${totalDialogues}`,
          })
          throw new Error(
            `Failed to create dialogue asset for panel ${panel.id}, dialogue ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          )
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
}
