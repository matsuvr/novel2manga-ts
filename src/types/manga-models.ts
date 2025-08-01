import { z } from 'zod'

// Position and Size schemas
const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const SizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
})

const MarginSchema = z.object({
  top: z.number().nonnegative(),
  right: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
  left: z.number().nonnegative(),
})

// Episode schema - 連載エピソード単位
export const EpisodeSchema = z.object({
  id: z.string(),
  novelId: z.string(), // Novel.idへの参照
  episodeNumber: z.number().positive(),
  title: z.string(),
  chapters: z.array(z.string()), // チャプターIDの配列
  climaxPoint: z.number().optional(), // クライマックスのテキスト位置
  startIndex: z.number(),
  endIndex: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Panel content schema
const PanelContentSchema = z.object({
  sceneId: z.string().optional(),
  dialogueIds: z.array(z.string()).optional(),
  situationId: z.string().optional(),
})

// Panel schema - 個別コマ
export const PanelSchema = z.object({
  id: z.string(),
  pageId: z.string(), // MangaPage.idへの参照
  position: PositionSchema,
  size: SizeSchema,
  panelType: z.enum(['normal', 'action', 'emphasis']),
  content: PanelContentSchema,
  readingOrder: z.number().positive(),
})

// Panel layout schema
export const PanelLayoutSchema = z.object({
  type: z.enum(['grid', 'free', 'vertical', 'horizontal']),
  columns: z.number().positive().optional(),
  rows: z.number().positive().optional(),
  gutterSize: z.number().nonnegative(),
  margin: MarginSchema,
})

// MangaPage schema - マンガページ
export const MangaPageSchema = z.object({
  id: z.string(),
  episodeId: z.string(), // Episode.idへの参照
  pageNumber: z.number().positive(),
  layoutFile: z.string(), // R2: novels/{novelId}/episodes/{episodeNumber}/pages/{pageNumber}/layout.yaml
  previewImageFile: z.string().optional(), // R2: novels/{novelId}/episodes/{episodeNumber}/pages/{pageNumber}/preview.png
  panels: z.array(PanelSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Reading order mapping
export const ReadingOrderSchema = z.record(z.string(), z.number().positive())

// TypeScript型定義
export type Position = z.infer<typeof PositionSchema>
export type Size = z.infer<typeof SizeSchema>
export type Margin = z.infer<typeof MarginSchema>
export type Episode = z.infer<typeof EpisodeSchema>
export type Panel = z.infer<typeof PanelSchema>
export type PanelContent = z.infer<typeof PanelContentSchema>
export type PanelLayout = z.infer<typeof PanelLayoutSchema>
export type MangaPage = z.infer<typeof MangaPageSchema>
export type ReadingOrder = z.infer<typeof ReadingOrderSchema>

// 日本式読み順の計算
// 右上から左下への読み順を計算する
export function getJapaneseReadingOrder(panels: Panel[]): ReadingOrder {
  // パネルを位置でソート
  // 1. Y座標（上から下）でグループ化
  // 2. 同じY座標内では、X座標（右から左）でソート

  const sortedPanels = [...panels].sort((a, b) => {
    // まずY座標で比較（上が優先）
    const yDiff = a.position.y - b.position.y

    // Y座標が近い場合（20px以内）は同じ行とみなす
    if (Math.abs(yDiff) <= 20) {
      // X座標で比較（右が優先 = 大きい値が先）
      return b.position.x - a.position.x
    }

    return yDiff
  })

  // 読み順を割り当て
  const readingOrder: ReadingOrder = {}
  sortedPanels.forEach((panel, index) => {
    readingOrder[panel.id] = index + 1
  })

  return readingOrder
}

// パネルを読み順でソート
export function sortPanelsByReadingOrder(panels: Panel[]): Panel[] {
  return [...panels].sort((a, b) => a.readingOrder - b.readingOrder)
}

// バリデーション関数
export function validateEpisode(data: unknown): Episode {
  return EpisodeSchema.parse(data)
}

export function validateMangaPage(data: unknown): MangaPage {
  return MangaPageSchema.parse(data)
}

export function validatePanel(data: unknown): Panel {
  return PanelSchema.parse(data)
}

export function validatePanelLayout(data: unknown): PanelLayout {
  return PanelLayoutSchema.parse(data)
}

// マンガページの作成ヘルパー関数
export function createMangaPage(
  episodeId: string,
  pageNumber: number,
  layoutFile: string,
  panels: Panel[] = [],
  previewImageFile?: string,
): Omit<MangaPage, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    episodeId,
    pageNumber,
    layoutFile,
    previewImageFile,
    panels,
  }
}

// グリッドレイアウトでパネルを自動配置
export function generateGridPanels(
  pageId: string,
  columns: number,
  rows: number,
  pageWidth: number,
  pageHeight: number,
  margin: Margin,
  gutterSize: number,
): Omit<Panel, 'id' | 'content'>[] {
  const panels: Omit<Panel, 'id' | 'content'>[] = []

  const availableWidth = pageWidth - margin.left - margin.right - gutterSize * (columns - 1)
  const availableHeight = pageHeight - margin.top - margin.bottom - gutterSize * (rows - 1)

  const panelWidth = availableWidth / columns
  const panelHeight = availableHeight / rows

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const panel: Omit<Panel, 'id' | 'content'> = {
        pageId,
        position: {
          x: margin.left + col * (panelWidth + gutterSize),
          y: margin.top + row * (panelHeight + gutterSize),
        },
        size: {
          width: panelWidth,
          height: panelHeight,
        },
        panelType: 'normal',
        readingOrder: 0, // 後で日本式読み順を適用
      }
      panels.push(panel)
    }
  }

  return panels
}
