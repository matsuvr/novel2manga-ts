import { load as yamlLoad } from 'js-yaml'
import { z } from 'zod'
import type { MangaLayout } from '@/types/panel-layout'
import { DialogueSchema, MangaLayoutSchema } from '@/types/panel-layout.zod'

// BBox 形式（public/docs/panel_layout_sample の形）を受け入れるためのスキーマ
const PanelBBoxSchema = z.object({
  id: z.union([z.string(), z.number()]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [x, y, w, h]
  content: z.string().optional(),
  dialogue: z.string().optional(),
  dialogues: z.array(DialogueSchema).optional(),
  sourceChunkIndex: z.number().optional(),
  importance: z.number().min(1).max(10).optional(),
})

const PageBBoxSchema = z.object({
  page_number: z.number(),
  panels_count: z.number().optional(),
  panels: z.array(PanelBBoxSchema),
})

const MangaLayoutBBoxSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  created_at: z.string().optional(),
  episodeNumber: z.number().optional(),
  episodeTitle: z.string().optional(),
  pages: z.array(PageBBoxSchema),
})

function toCanonicalFromBBox(input: z.infer<typeof MangaLayoutBBoxSchema>): MangaLayout {
  const title = input.title ?? 'Untitled'
  const created_at = input.created_at ?? new Date().toISOString()
  const episodeNumber = input.episodeNumber ?? 1

  const pages = input.pages.map((p) => ({
    page_number: p.page_number,
    panels: p.panels.map((panel) => {
      const [x, y, w, h] = panel.bbox
      return {
        id: panel.id,
        position: { x, y },
        size: { width: w, height: h },
        content: panel.content ?? '',
        dialogues:
          panel.dialogues ?? (panel.dialogue ? [{ speaker: '', text: panel.dialogue }] : []),
        sourceChunkIndex: panel.sourceChunkIndex,
        importance: panel.importance,
      }
    }),
  }))

  const parsed = MangaLayoutSchema.parse({
    title,
    author: input.author,
    created_at,
    episodeNumber,
    episodeTitle: input.episodeTitle,
    pages,
  })
  return parsed
}

/**
 * YAMLテキストを読み込み、BBox形式/既存形式のどちらでも受け入れて
 * 正規の MangaLayout に変換して返す。
 */
export function parseMangaLayoutFromYaml(layoutYaml: string): MangaLayout {
  const raw = yamlLoad(layoutYaml)

  // 1) 既存の正規スキーマ
  const canon = MangaLayoutSchema.safeParse(raw)
  if (canon.success) return canon.data

  // 2) BBox形式
  const bbox = MangaLayoutBBoxSchema.safeParse(raw)
  if (bbox.success) return toCanonicalFromBBox(bbox.data)

  // 3) 互換形式: { pages: [ { "page_22": { panels_count, panels: [...] } }, ... ] }
  if (
    raw &&
    typeof raw === 'object' &&
    'pages' in (raw as Record<string, unknown>) &&
    Array.isArray((raw as Record<string, unknown>).pages)
  ) {
    const arr = (
      raw as {
        pages: Array<
          Record<
            string,
            {
              panels_count?: number
              panels: Array<{
                id: string | number
                bbox: [number, number, number, number]
                content?: string
                dialogue?: string
                dialogues?: Array<z.infer<typeof DialogueSchema>>
              }>
            }
          >
        >
      }
    ).pages
    const pages = arr.flatMap((obj, idx) => {
      const key = Object.keys(obj)[0]
      if (!key) return []
      const m = key.match(/^page_(\d+)$/)
      const pageNum = m ? Number(m[1]) : idx + 1
      const pageObj = obj[key]
      const panels = (pageObj?.panels || []).map((panel) => {
        const [x, y, w, h] = panel.bbox
        return {
          id: panel.id,
          position: { x, y },
          size: { width: w, height: h },
          content: panel.content ?? '',
          dialogues:
            panel.dialogues ?? (panel.dialogue ? [{ speaker: '', text: panel.dialogue }] : []),
        }
      })
      return [{ page_number: pageNum, panels }]
    })
    const parsed = MangaLayoutSchema.safeParse({
      title: 'Untitled',
      created_at: new Date().toISOString(),
      episodeNumber: 1,
      pages,
    })
    if (parsed.success) return parsed.data
  }

  // 4) 互換形式: { pages: { "page_22": { ... }, "page_23": { ... } } }（オブジェクトマップ）
  if (
    raw &&
    typeof raw === 'object' &&
    'pages' in (raw as Record<string, unknown>) &&
    (raw as Record<string, unknown>).pages &&
    typeof (raw as { pages: unknown }).pages === 'object' &&
    !Array.isArray((raw as { pages: unknown }).pages)
  ) {
    const map = (
      raw as {
        title?: string
        created_at?: string
        episodeNumber?: number
        pages: Record<
          string,
          {
            panels_count?: number
            panels: Array<{
              id: string | number
              bbox?: [number, number, number, number]
              position?: { x: number; y: number }
              size?: { width: number; height: number }
              content?: string
              dialogue?: string
              dialogues?: Array<z.infer<typeof DialogueSchema> | string>
            }>
          }
        >
      }
    ).pages

    const pages = Object.entries(map).map(([k, v], idx) => {
      const m = k.match(/^page_(\d+)$/)
      const pageNum = m ? Number(m[1]) : idx + 1
      const panels = (v?.panels || []).map((panel) => {
        // 位置は bbox 優先、なければ position/size から組み立て
        const [x, y, w, h] = panel.bbox
          ? panel.bbox
          : [
              panel.position?.x ?? 0,
              panel.position?.y ?? 0,
              panel.size?.width ?? 0,
              panel.size?.height ?? 0,
            ]

        // dialogues は string を許容して {text} に正規化
        const normalizedDialogs = Array.isArray(panel.dialogues)
          ? panel.dialogues.map((d) =>
              typeof d === 'string'
                ? { speaker: '', text: d }
                : {
                    speaker: d.speaker || '',
                    text: d.text,
                    emotion: 'emotion' in d ? d.emotion : undefined,
                  },
            )
          : panel.dialogue
            ? [{ speaker: '', text: panel.dialogue }]
            : []

        return {
          id: panel.id,
          position: { x, y },
          size: { width: w, height: h },
          content: panel.content ?? '',
          dialogues: normalizedDialogs,
        }
      })
      return { page_number: pageNum, panels }
    })

    const parsed = MangaLayoutSchema.safeParse({
      title: (raw as { title?: string }).title ?? 'Untitled',
      created_at: (raw as { created_at?: string }).created_at ?? new Date().toISOString(),
      episodeNumber: (raw as { episodeNumber?: number }).episodeNumber ?? 1,
      pages,
    })
    if (parsed.success) return parsed.data
  }

  // 5) 互換形式: { "page_22": { panels_count, panels: [...] } } 単体
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw as Record<string, unknown>)
    if (keys.length === 1 && /^page_\d+$/.test(keys[0])) {
      const pageNum = Number(keys[0].split('_')[1])
      const pageObj = (
        raw as Record<
          string,
          {
            panels_count?: number
            panels: Array<{
              id: string | number
              bbox?: [number, number, number, number]
              position?: { x: number; y: number }
              size?: { width: number; height: number }
              content?: string
              dialogue?: string
              dialogues?: Array<z.infer<typeof DialogueSchema> | string>
            }>
          }
        >
      )[keys[0]]

      const panels = (pageObj?.panels || []).map((panel) => {
        const [x, y, w, h] = panel.bbox
          ? panel.bbox
          : [
              panel.position?.x ?? 0,
              panel.position?.y ?? 0,
              panel.size?.width ?? 0,
              panel.size?.height ?? 0,
            ]
        const normalizedDialogs = Array.isArray(panel.dialogues)
          ? panel.dialogues.map((d) =>
              typeof d === 'string'
                ? { speaker: '', text: d }
                : {
                    speaker: d.speaker || '',
                    text: d.text,
                    emotion: 'emotion' in d ? d.emotion : undefined,
                  },
            )
          : panel.dialogue
            ? [{ speaker: '', text: panel.dialogue }]
            : []
        return {
          id: panel.id,
          position: { x, y },
          size: { width: w, height: h },
          content: panel.content ?? '',
          dialogues: normalizedDialogs,
        }
      })
      const parsed = MangaLayoutSchema.safeParse({
        title: 'Untitled',
        created_at: new Date().toISOString(),
        episodeNumber: 1,
        pages: [{ page_number: pageNum, panels }],
      })
      if (parsed.success) return parsed.data
    }
  }

  throw new Error('Invalid YAML layout: unsupported structure (neither canonical nor bbox)')
}

/** 内部の正規レイアウト (position/size) を BBox 形式に変換するユーティリティ */
export function toBBoxLayout(layout: MangaLayout): {
  title: string
  author?: string
  created_at: string
  episodeNumber: number
  episodeTitle?: string
  pages: Array<{
    page_number: number
    panels_count: number
    panels: Array<{
      id: string | number
      bbox: [number, number, number, number]
      content: string
      dialogues?: z.infer<typeof DialogueSchema>[]
    }>
  }>
} {
  return {
    title: layout.title,
    author: layout.author,
    created_at: layout.created_at,
    episodeNumber: layout.episodeNumber,
    episodeTitle: layout.episodeTitle,
    pages: layout.pages.map((p) => ({
      page_number: p.page_number,
      panels_count: p.panels.length,
      panels: p.panels.map((panel) => ({
        id: panel.id,
        bbox: [panel.position.x, panel.position.y, panel.size.width, panel.size.height],
        content: panel.content,
        dialogues: panel.dialogues,
      })),
    })),
  }
}
