import type { ChunkAnalysisResult, Position, Size } from '@/types/panel-layout'

export interface PanelLayoutConfig {
  margin: number
  panelSpacing: number
  preferredPanelsPerPage: number
  maxPanelsPerPage: number
  minPanelWidth: number
  minPanelHeight: number
}

export interface PanelLayout {
  position: Position
  size: Size
}

export class PanelLayoutEngine {
  private config: PanelLayoutConfig

  constructor(config?: Partial<PanelLayoutConfig>) {
    this.config = {
      margin: 20,
      panelSpacing: 10,
      preferredPanelsPerPage: 6,
      maxPanelsPerPage: 8,
      minPanelWidth: 0.2, // 最小20%幅
      minPanelHeight: 0.2, // 最小20%高さ
      ...config,
    }
  }

  /**
   * チャンク分析結果をページに分割
   */
  divideIntoPages(chunks: ChunkAnalysisResult[]): ChunkAnalysisResult[][] {
    const pages: ChunkAnalysisResult[][] = []
    let currentPage: ChunkAnalysisResult[] = []

    for (const chunk of chunks) {
      // ハイライトシーンは単独ページにする可能性を考慮
      const isHighlight = chunk.highlights?.some((h) => h.importance >= 8)

      if (isHighlight && currentPage.length > 0) {
        // 現在のページを確定
        pages.push(currentPage)
        currentPage = [chunk]
      } else {
        currentPage.push(chunk)

        // ページが満杯になったら次のページへ
        if (currentPage.length >= this.config.preferredPanelsPerPage) {
          pages.push(currentPage)
          currentPage = []
        }
      }
    }

    // 最後のページを追加
    if (currentPage.length > 0) {
      pages.push(currentPage)
    }

    return pages
  }

  /**
   * チャンクに基づいてパネルレイアウトを計算
   */
  calculatePanelLayout(chunks: ChunkAnalysisResult[]): PanelLayout[] {
    const panelCount = chunks.length

    // パネル数に応じてレイアウトパターンを選択
    if (panelCount === 1) {
      return this.singlePanelLayout()
    } else if (panelCount === 2) {
      return this.twoPanelLayout(chunks)
    } else if (panelCount === 3) {
      return this.threePanelLayout(chunks)
    } else if (panelCount === 4) {
      return this.fourPanelLayout(chunks)
    } else if (panelCount === 5 || panelCount === 6) {
      return this.sixPanelLayout(chunks)
    } else {
      return this.gridLayout(chunks)
    }
  }

  /**
   * 単一パネルレイアウト（見開き全体）
   */
  private singlePanelLayout(): PanelLayout[] {
    const margin = this.config.margin / 1000 // 正規化
    return [
      {
        position: { x: margin, y: margin },
        size: { width: 1 - 2 * margin, height: 1 - 2 * margin },
      },
    ]
  }

  /**
   * 2パネルレイアウト
   */
  private twoPanelLayout(chunks: ChunkAnalysisResult[]): PanelLayout[] {
    const margin = this.config.margin / 1000
    const spacing = this.config.panelSpacing / 1000

    // 重要度に応じて縦分割か横分割を決定
    const verticalSplit = chunks.some((c) => c.highlights?.some((h) => h.importance >= 7))

    if (verticalSplit) {
      // 縦分割（右から左へ）
      const width = (1 - 2 * margin - spacing) / 2
      return [
        {
          position: { x: 0.5 + spacing / 2, y: margin },
          size: { width, height: 1 - 2 * margin },
        },
        {
          position: { x: margin, y: margin },
          size: { width, height: 1 - 2 * margin },
        },
      ]
    } else {
      // 横分割
      const height = (1 - 2 * margin - spacing) / 2
      return [
        {
          position: { x: margin, y: margin },
          size: { width: 1 - 2 * margin, height },
        },
        {
          position: { x: margin, y: 0.5 + spacing / 2 },
          size: { width: 1 - 2 * margin, height },
        },
      ]
    }
  }

  /**
   * 3パネルレイアウト（L字型）
   */
  private threePanelLayout(chunks: ChunkAnalysisResult[]): PanelLayout[] {
    const margin = this.config.margin / 1000
    const spacing = this.config.panelSpacing / 1000

    // 最初のパネルが重要な場合は大きくする
    const firstImportant = chunks[0].highlights?.some((h) => h.importance >= 7)

    if (firstImportant) {
      // 右上に大きなパネル、左側に2つの小さなパネル
      return [
        {
          position: { x: 0.4 + spacing / 2, y: margin },
          size: { width: 0.6 - margin - spacing / 2, height: 1 - 2 * margin },
        },
        {
          position: { x: margin, y: margin },
          size: { width: 0.4 - margin - spacing / 2, height: 0.5 - margin - spacing / 2 },
        },
        {
          position: { x: margin, y: 0.5 + spacing / 2 },
          size: { width: 0.4 - margin - spacing / 2, height: 0.5 - margin - spacing / 2 },
        },
      ]
    } else {
      // 均等な3分割
      const width = (1 - 2 * margin - 2 * spacing) / 3
      return [
        {
          position: { x: 1 - margin - width, y: margin },
          size: { width, height: 1 - 2 * margin },
        },
        {
          position: { x: 0.5 - width / 2, y: margin },
          size: { width, height: 1 - 2 * margin },
        },
        {
          position: { x: margin, y: margin },
          size: { width, height: 1 - 2 * margin },
        },
      ]
    }
  }

  /**
   * 4パネルレイアウト（田の字型）
   */
  private fourPanelLayout(_chunks: ChunkAnalysisResult[]): PanelLayout[] {
    const margin = this.config.margin / 1000
    const spacing = this.config.panelSpacing / 1000
    const width = (1 - 2 * margin - spacing) / 2
    const height = (1 - 2 * margin - spacing) / 2

    // 日本式読み順（右上→左上→右下→左下）
    return [
      {
        position: { x: 0.5 + spacing / 2, y: margin },
        size: { width, height },
      },
      {
        position: { x: margin, y: margin },
        size: { width, height },
      },
      {
        position: { x: 0.5 + spacing / 2, y: 0.5 + spacing / 2 },
        size: { width, height },
      },
      {
        position: { x: margin, y: 0.5 + spacing / 2 },
        size: { width, height },
      },
    ]
  }

  /**
   * 6パネルレイアウト（2x3グリッド）
   */
  private sixPanelLayout(chunks: ChunkAnalysisResult[]): PanelLayout[] {
    const margin = this.config.margin / 1000
    const spacing = this.config.panelSpacing / 1000
    const width = (1 - 2 * margin - spacing) / 2
    const height = (1 - 2 * margin - 2 * spacing) / 3

    const layouts: PanelLayout[] = []

    // 重要なシーンがある場合は変形レイアウト
    const importantIndex = chunks.findIndex((c) => c.highlights?.some((h) => h.importance >= 8))

    if (importantIndex !== -1 && importantIndex < 3) {
      // 上部に大きなパネルを配置
      layouts.push({
        position: { x: margin, y: margin },
        size: { width: 1 - 2 * margin, height: height * 1.5 },
      })

      // 残りを下部に配置
      const remainingHeight = 1 - margin - (height * 1.5 + margin + spacing)
      const smallHeight = (remainingHeight - spacing) / 2

      for (let i = 0; i < 4; i++) {
        const row = Math.floor(i / 2)
        const col = i % 2
        layouts.push({
          position: {
            x: col === 0 ? 0.5 + spacing / 2 : margin,
            y: margin + height * 1.5 + spacing + row * (smallHeight + spacing),
          },
          size: { width, height: smallHeight },
        })
      }
    } else {
      // 通常の2x3グリッド
      for (let i = 0; i < 6; i++) {
        const row = Math.floor(i / 2)
        const col = i % 2
        layouts.push({
          position: {
            x: col === 0 ? 0.5 + spacing / 2 : margin,
            y: margin + row * (height + spacing),
          },
          size: { width, height },
        })
      }
    }

    return layouts.slice(0, chunks.length)
  }

  /**
   * グリッドレイアウト（7パネル以上）
   */
  private gridLayout(chunks: ChunkAnalysisResult[]): PanelLayout[] {
    const margin = this.config.margin / 1000
    const spacing = this.config.panelSpacing / 1000
    const panelCount = Math.min(chunks.length, this.config.maxPanelsPerPage)

    // 行数と列数を計算
    const cols = Math.ceil(Math.sqrt(panelCount))
    const rows = Math.ceil(panelCount / cols)

    const width = (1 - 2 * margin - (cols - 1) * spacing) / cols
    const height = (1 - 2 * margin - (rows - 1) * spacing) / rows

    const layouts: PanelLayout[] = []

    for (let i = 0; i < panelCount; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols

      // 日本式に右から左へ配置
      const x = margin + (cols - 1 - col) * (width + spacing)
      const y = margin + row * (height + spacing)

      layouts.push({
        position: { x, y },
        size: { width, height },
      })
    }

    return layouts
  }
}
