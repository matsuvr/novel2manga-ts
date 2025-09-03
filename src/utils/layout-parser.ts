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
  const __debug = process.env.DEBUG_LAYOUT_PARSER === '1'
  if (__debug) {
    try {
      // eslint-disable-next-line no-console
      console.log('[layout-parser] YAML raw preview:', JSON.stringify(raw))
    } catch {
      // eslint-disable-next-line no-console
      console.log('[layout-parser] YAML raw preview: <unserializable>')
    }
  }

  // 1) 既存の正規スキーマ（そのまま通る場合）
  const canon = MangaLayoutSchema.safeParse(raw)
  if (canon.success) {
    if (__debug) console.log('[layout-parser] matched: canonical schema')
    return canon.data
  }

  // 1.5) 正規っぽい構造だが微妙な差異がある場合は正規化してから検証
  const isCanonicalLike = (
    v: unknown,
  ): v is {
    title?: unknown
    author?: unknown
    created_at?: unknown
    episodeNumber?: unknown
    episodeTitle?: unknown
    pages?: unknown
  } =>
    !!(
      v &&
      typeof v === 'object' &&
      'pages' in (v as Record<string, unknown>) &&
      Array.isArray((v as Record<string, unknown>).pages) &&
      (v as { pages: unknown[] }).pages.every(
        (p) =>
          p &&
          typeof p === 'object' &&
          'page_number' in (p as Record<string, unknown>) &&
          'panels' in (p as Record<string, unknown>),
      )
    )

  if (isCanonicalLike(raw)) {
    if (__debug) console.log('[layout-parser] matched: canonical-like normalization path')
    // dialogues の要素に string が混在していても正規化し、type を保持
    const rawCreated = (raw as { created_at?: unknown }).created_at
    const normalized = {
      title: (raw as { title?: string }).title ?? 'Untitled',
      author: (raw as { author?: string }).author,
      created_at:
        typeof rawCreated === 'string'
          ? rawCreated
          : rawCreated instanceof Date
            ? rawCreated.toISOString()
            : new Date().toISOString(),
      episodeNumber: (raw as { episodeNumber?: number }).episodeNumber ?? 1,
      episodeTitle: (raw as { episodeTitle?: string }).episodeTitle,
      pages: (raw as { pages: Array<{ page_number: number; panels: unknown[] }> }).pages.map(
        (p) => ({
          page_number: (p as { page_number: number }).page_number,
          panels: (p as { panels: Array<unknown> }).panels.map((panel) => {
            const pos = (panel as { position?: { x: number; y: number } }).position || {
              x: 0,
              y: 0,
            }
            const size = (panel as { size?: { width: number; height: number } }).size || {
              width: 0,
              height: 0,
            }
            const dialoguesRaw = (panel as { dialogues?: Array<unknown> }).dialogues
            const normalizedDialogs = Array.isArray(dialoguesRaw)
              ? dialoguesRaw.map((d) =>
                  typeof d === 'string'
                    ? { speaker: '', text: d }
                    : (() => {
                        if (!d || typeof d !== 'object') {
                          return { speaker: '', text: '' }
                        }
                        const obj = d as Record<string, unknown>
                        const speaker = typeof obj.speaker === 'string' ? obj.speaker : ''
                        const text = typeof obj.text === 'string' ? obj.text : ''
                        const emotion = typeof obj.emotion === 'string' ? obj.emotion : undefined
                        const tRaw = typeof obj.type === 'string' ? obj.type : undefined
                        const allowed: ReadonlyArray<string> = ['speech', 'thought', 'narration']
                        const type =
                          tRaw && allowed.includes(tRaw)
                            ? (tRaw as 'speech' | 'thought' | 'narration')
                            : undefined
                        return { speaker, text, emotion, type }
                      })(),
                )
              : []
            return {
              id: (panel as { id: string | number }).id,
              position: { x: pos.x, y: pos.y },
              size: { width: size.width, height: size.height },
              content: (panel as { content?: string }).content ?? '',
              dialogues: normalizedDialogs,
              sourceChunkIndex: (panel as { sourceChunkIndex?: number }).sourceChunkIndex,
              importance: (panel as { importance?: number }).importance,
            }
          }),
        }),
      ),
    }
    const parsed = MangaLayoutSchema.safeParse(normalized)
    if (parsed.success) {
      if (__debug) console.log('[layout-parser] canonical-like normalized -> valid')
      return parsed.data
    }
    if (__debug)
      console.log('[layout-parser] canonical-like normalized -> INVALID', parsed.error?.errors)
  }

  // 2) BBox形式
  const bbox = MangaLayoutBBoxSchema.safeParse(raw)
  if (bbox.success) {
    if (__debug) console.log('[layout-parser] matched: bbox schema')
    return toCanonicalFromBBox(bbox.data)
  }

  // 3) 互換形式: { pages: [ { "page_22": { panels_count, panels: [...] } }, ... ] }
  //    要素が単一キーで page_\d+ に一致する場合のみ適用（正規形式と誤判定しない）
  if (
    raw &&
    typeof raw === 'object' &&
    'pages' in (raw as Record<string, unknown>) &&
    Array.isArray((raw as Record<string, unknown>).pages) &&
    (raw as { pages: unknown[] }).pages.every(
      (obj) =>
        !!(
          obj &&
          typeof obj === 'object' &&
          Object.keys(obj as Record<string, unknown>).length === 1 &&
          /^page_\d+$/.test(Object.keys(obj as Record<string, unknown>)[0] || '')
        ),
    )
  ) {
    if (__debug) console.log('[layout-parser] matched: pages array object-map path')
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
    if (parsed.success) {
      if (__debug) console.log('[layout-parser] pages array object-map -> valid')
      return parsed.data
    }
    if (__debug)
      console.log('[layout-parser] pages array object-map -> INVALID', parsed.error?.errors)
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
    if (__debug) console.log('[layout-parser] matched: pages object-map path')
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
                    // 新フォーマットの type を保持（存在すれば）
                    type: (() => {
                      const tVal = (d as { type?: unknown }).type
                      const t = typeof tVal === 'string' ? tVal : undefined
                      const allowed: ReadonlyArray<string> = ['speech', 'thought', 'narration']
                      return t && allowed.includes(t)
                        ? (t as 'speech' | 'thought' | 'narration')
                        : undefined
                    })(),
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

    const rawCreated2 = (raw as { created_at?: unknown }).created_at
    const parsed = MangaLayoutSchema.safeParse({
      title: (raw as { title?: string }).title ?? 'Untitled',
      created_at:
        typeof rawCreated2 === 'string'
          ? rawCreated2
          : rawCreated2 instanceof Date
            ? rawCreated2.toISOString()
            : new Date().toISOString(),
      episodeNumber: (raw as { episodeNumber?: number }).episodeNumber ?? 1,
      pages,
    })
    if (parsed.success) {
      if (__debug) console.log('[layout-parser] pages object-map -> valid')
      return parsed.data
    }
    if (__debug) console.log('[layout-parser] pages object-map -> INVALID', parsed.error?.errors)
  }

  // 5) 互換形式: { "page_22": { panels_count, panels: [...] } } 単体
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw as Record<string, unknown>)
    if (keys.length === 1 && /^page_\d+$/.test(keys[0])) {
      if (__debug) console.log('[layout-parser] matched: single page_* object path')
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
                    type: (() => {
                      const tVal = (d as { type?: unknown }).type
                      const t = typeof tVal === 'string' ? tVal : undefined
                      const allowed: ReadonlyArray<string> = ['speech', 'thought', 'narration']
                      return t && allowed.includes(t)
                        ? (t as 'speech' | 'thought' | 'narration')
                        : undefined
                    })(),
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
      if (parsed.success) {
        if (__debug) console.log('[layout-parser] single page_* object -> valid')
        return parsed.data
      }
      if (__debug)
        console.log('[layout-parser] single page_* object -> INVALID', parsed.error?.errors)
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
