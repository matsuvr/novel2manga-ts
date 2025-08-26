import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
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
  try {
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

    if (!result) {
      throw new Error('LLM generator returned undefined result')
    }

    // 結果が空の場合はフォールバック処理を実行
    if (!result.pages || result.pages.length === 0) {
      console.warn('LLM generator returned empty result, using fallback')
      throw new Error('LLM generator returned empty result')
    }

    return result as PanelAssignmentPlan
  } catch (error) {
    // フォールバック処理（最小限・堅牢）: pageBreaks の形式が不完全でも落ちないようにする
    console.warn('Panel assignment failed, using fallback:', error)

    const fallbackAssignment: PanelAssignmentPlan = {
      pages: (Array.isArray(pageBreaks?.pages) ? pageBreaks.pages : []).map((page) => {
        const panelCount = Math.max(
          1,
          Number.isFinite(Number(page.panelCount))
            ? Number(page.panelCount)
            : Array.isArray((page as unknown as { panels?: unknown[] }).panels)
              ? (page as unknown as { panels?: unknown[] }).panels?.length || 1
              : 1,
        )
        return {
          pageNumber: Number.isFinite(Number(page.pageNumber)) ? Number(page.pageNumber) : 1,
          panelCount,
          // 行の割当は空で返す。後段の PageBreakStep 側で未割当行を自動配分する
          panels: Array.from({ length: panelCount }, (_, i) => ({
            id: i + 1,
            lines: [] as number[],
          })),
        }
      }),
    }

    console.log('Fallback assignment generated:', JSON.stringify(fallbackAssignment, null, 2))
    return fallbackAssignment
  }
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
      const allScriptLines = script.scenes?.flatMap((scene) => scene.script || []) || []
      const lines: ScriptLine[] = pp.lines
        .map((i) => allScriptLines.find((s) => s.index === i))
        .filter((v): v is ScriptLine => !!v)

      const stageLines = lines.filter((l) => l.type === 'stage')
      const narrationLines = lines.filter((l) => l.type === 'narration')
      const speeches = lines.filter((l) => l.type === 'dialogue' || l.type === 'thought')

      // content にはナレーションを含めない。舞台指示や状況（stage）のみを反映する
      let content = stageLines.map((n) => n.text).join('\n')
      // dialogues にはセリフ・心の声・ナレーションを含める
      const speechDialogues: Dialogue[] = speeches.map((d) => ({
        speaker: d.speaker || '',
        text: d.text,
        type: d.type === 'thought' ? 'thought' : 'speech',
      }))
      const narrationDialogues: Dialogue[] = narrationLines.map((d) => ({
        speaker: d.speaker || '',
        text: d.text,
        type: 'narration',
      }))
      const dialogues: Dialogue[] = [...speechDialogues, ...narrationDialogues]

      // 空コマ禁止: content が空の場合でも、dialogue を content にコピーしない
      // シーンの setting/description を優先して反映する
      if (!content || content.trim().length === 0) {
        const parentScene = script.scenes?.find((scene) =>
          scene.script?.some((s) => lines.some((l) => l.index === s.index)),
        )
        const settingOrDesc = [parentScene?.setting, parentScene?.description]
          .filter((v): v is string => !!v && v.trim().length > 0)
          .join(' / ')
        content = settingOrDesc && settingOrDesc.trim().length > 0 ? settingOrDesc : '…'
      }

      // 重要度スコアリング（type重み付け強化）
      const speechCount = dialogues.filter(
        (d) => (d as { type?: 'speech' | 'thought' | 'narration' }).type === 'speech',
      ).length
      const thoughtCount = dialogues.filter(
        (d) => (d as { type?: 'speech' | 'thought' | 'narration' }).type === 'thought',
      ).length
      const narrationCount = dialogues.filter(
        (d) => (d as { type?: 'speech' | 'thought' | 'narration' }).type === 'narration',
      ).length
      const stageCount = stageLines.length
      const contentBoost = content.length >= 50 ? 1 : 0
      const rawImportance =
        3 +
        2 * (speechCount + thoughtCount) +
        Math.min(2, narrationCount) +
        Math.min(2, stageCount) +
        contentBoost
      const importance = Math.min(10, Math.max(3, rawImportance))

      const shape = template.panels[idx % template.panels.length]
      return {
        id: nextId++,
        position: shape.position,
        size: shape.size,
        content,
        dialogues,
        sourceChunkIndex: 0,
        importance,
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
      const dialogueArr = Array.isArray(pp.dialogue) ? pp.dialogue : []
      const dialogues: Dialogue[] = dialogueArr.map((d) => ({
        speaker: d.speaker,
        text:
          (d as { text?: string; lines?: string }).text ?? (d as { lines?: string }).lines ?? '',
      }))

      // 空コマ禁止: content が空の場合でも、dialogue を content にコピーしない
      if (!content || content.trim().length === 0) {
        content = '…'
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
          Math.max(
            3,
            // セリフ/心の声を高く評価、次点で長い状況説明
            dialogues.filter(
              (d) =>
                (d as { type?: 'speech' | 'thought' | 'narration' }).type === 'speech' ||
                (d as { type?: 'speech' | 'thought' | 'narration' }).type === 'thought',
            ).length >= 2
              ? 7
              : content.length >= 50
                ? 6
                : 5,
          ),
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
