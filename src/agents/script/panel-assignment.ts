import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getPanelAssignmentConfig } from '@/config'
import type { Dialogue, MangaLayout, Panel } from '@/types/panel-layout'
import {
  type PageBreakPlan,
  type PanelAssignmentPlan,
  PanelAssignmentSchema,
  type Script,
  type ScriptLine,
} from '@/types/script'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'

export async function assignPanels(
  script: Script,
  pageBreaks: PageBreakPlan,
  _opts?: { jobId?: string; episodeNumber?: number },
): Promise<PanelAssignmentPlan> {
  const generator = getLlmStructuredGenerator()
  const cfg = getPanelAssignmentConfig()
  const prompt = (cfg.userPromptTemplate || '')
    .replace('{{scriptJson}}', JSON.stringify(script, null, 2))
    .replace('{{pageBreaksJson}}', JSON.stringify(pageBreaks, null, 2))
  const result = await generator.generateObjectWithFallback({
    name: 'panel-assignment',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: PanelAssignmentSchema as unknown as z.ZodTypeAny,
    schemaName: 'PanelAssignmentPlan',
  })
  return result as PanelAssignmentPlan
}

export function buildLayoutFromAssignment(
  script: Script,
  assignment: PanelAssignmentPlan,
  episodeMeta: { title: string; episodeNumber: number; episodeTitle?: string },
): MangaLayout {
  const pages = assignment.pages.map((p) => {
    const template = selectLayoutTemplateByCountRandom(Math.max(1, p.panelCount))
    let nextId = 1
    const panels: Panel[] = p.panels.map((pp, idx) => {
      const lines: ScriptLine[] = pp.lines
        .map((i) => script.script.find((s) => s.index === i))
        .filter((v): v is ScriptLine => !!v)

      const narratives = lines.filter((l) => l.type === 'narration' || l.type === 'stage')
      const speeches = lines.filter((l) => l.type === 'dialogue' || l.type === 'thought')

      let content = narratives.map((n) => n.text).join('\n')
      const dialogues: Dialogue[] = speeches.map((d) => ({
        speaker: d.speaker || '',
        text: d.text,
      }))

      // 空コマ禁止: content が空の場合は対話テキストの一部を content にも反映
      if (!content || content.trim().length === 0) {
        if (speeches.length > 0) {
          content = speeches
            .slice(0, 2)
            .map((d) => (d.speaker ? `${d.speaker}: ${d.text}` : d.text))
            .join('\n')
        } else {
          content = '…'
        }
      }

      const shape = template.panels[idx % template.panels.length]
      return {
        id: nextId++,
        position: shape.position,
        size: shape.size,
        content,
        dialogues,
        sourceChunkIndex: 0,
        importance: Math.min(
          10,
          Math.max(3, dialogues.length >= 2 ? 7 : narratives.length >= 1 ? 6 : 5),
        ),
      }
    })

    return { page_number: p.pageNumber, panels }
  })

  return {
    title: episodeMeta.episodeTitle || `エピソード${episodeMeta.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeMeta.episodeNumber,
    episodeTitle: episodeMeta.episodeTitle,
    pages,
  }
}

export function buildLayoutFromPageBreaks(
  pageBreaks: PageBreakPlan,
  episodeMeta: { title: string; episodeNumber: number; episodeTitle?: string },
): MangaLayout {
  const pages = pageBreaks.pages.map((p) => {
    const template = selectLayoutTemplateByCountRandom(Math.max(1, p.panelCount))
    let nextId = 1
    const panels: Panel[] = p.panels.map((pp, idx) => {
      // 新しい形式からcontentとdialogueを直接取得
      let content = pp.content || ''
      const dialogues: Dialogue[] = pp.dialogue.map((d) => ({
        speaker: d.speaker,
        text: d.lines,
      }))

      // 空コマ禁止: content が空の場合は対話テキストの一部を content にも反映
      if (!content || content.trim().length === 0) {
        if (dialogues.length > 0) {
          content = dialogues
            .slice(0, 2)
            .map((d) => (d.speaker ? `${d.speaker}: ${d.text}` : d.text))
            .join('\n')
        } else {
          content = '…'
        }
      }

      const shape = template.panels[idx % template.panels.length]
      return {
        id: nextId++,
        position: shape.position,
        size: shape.size,
        content,
        dialogues,
        sourceChunkIndex: 0,
        importance: Math.min(
          10,
          Math.max(3, dialogues.length >= 2 ? 7 : content.length >= 50 ? 6 : 5),
        ),
      }
    })

    return { page_number: p.pageNumber, panels }
  })

  return {
    title: episodeMeta.episodeTitle || `エピソード${episodeMeta.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeMeta.episodeNumber,
    episodeTitle: episodeMeta.episodeTitle,
    pages,
  }
}
