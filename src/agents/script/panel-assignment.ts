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
  _opts?: { jobId?: string; episodeNumber?: number; maxElementChars?: number },
): Promise<PanelAssignmentPlan> {
  try {
    const generator = getLlmStructuredGenerator()
    const cfg = getPanelAssignmentConfig()
    let prompt = (cfg.userPromptTemplate || '')
      .replace('{{scriptJson}}', JSON.stringify(script, null, 2))
      .replace('{{pageBreaksJson}}', JSON.stringify(pageBreaks, null, 2))
    if (_opts?.maxElementChars && Number.isFinite(_opts.maxElementChars)) {
      prompt += `\n\nIMPORTANT CONSTRAINTS:\n- Keep per-panel content and any dialogue text length <= ${_opts.maxElementChars} characters.\n- Prefer assigning fewer script lines to a panel rather than exceeding the limit.`
    }
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
            scriptIndexes: [] as number[],
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
  const recentContentGlobal = new Set<string>()
  const pages = assignment.pages.map((p) => {
    const template = selectLayoutTemplateByCountRandom(Math.max(1, p.panelCount))
    let nextId = 1
    const usedContentInPage = new Set<string>()
    const panels: Panel[] = p.panels.map((pp, idx) => {
      const allScriptLines = script.scenes?.flatMap((scene) => scene.script || []) || []
      const lines: ScriptLine[] = pp.scriptIndexes
        .map((i) => allScriptLines.find((s) => s.index === i))
        .filter((v): v is ScriptLine => !!v)

      const stageLines = lines.filter((l) => l.type === 'stage')
      const narrationLines = lines.filter((l) => l.type === 'narration')
      let speeches = lines.filter((l) => l.type === 'dialogue' || l.type === 'thought')
      // セリフ0〜2制約（登場順優先）
      if (speeches.length > 2) {
        speeches = speeches.slice(0, 2)
      }

      // content（= thingsToBeDrawn）の決定: セリフ本文の重複を避け、絵として描くべき対象を短く表現
      const parentScene = script.scenes?.find((scene) =>
        scene.script?.some((s) => lines.some((l) => l.index === s.index)),
      )
      let content = decideThingsToBeDrawn({
        stageLines,
        narrationLines,
        speeches,
        parentScene,
      })
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

      // 空コマ禁止: content が空の場合、セリフ本文はコピーせず、シーン情報 or 話者名で補完
      if (!content || content.trim().length === 0) {
        const settingOrDesc = [parentScene?.setting, parentScene?.description]
          .filter((v): v is string => !!v && v.trim().length > 0)
          .join(' / ')
        content =
          settingOrDesc && settingOrDesc.trim().length > 0
            ? settingOrDesc
            : deriveSpeakerFallback(speeches)
      }

      // 同一ページや直近の重複 content を抑制（文/行の一部を代替として採用）
      if (usedContentInPage.has(content) || recentContentGlobal.has(content)) {
        const alt = pickAlternateSentence(
          content,
          (cand) => !usedContentInPage.has(cand) && !recentContentGlobal.has(cand),
        )
        content = alt && alt.trim().length > 0 ? alt : deriveSpeakerFallback(speeches)
      }
      usedContentInPage.add(content)
      recentContentGlobal.add(content)

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

// ==== helpers for content (thingsToBeDrawn) generation ====
function decideThingsToBeDrawn(args: {
  stageLines: ScriptLine[]
  narrationLines: ScriptLine[]
  speeches: ScriptLine[]
  parentScene?: { setting?: string; description?: string }
}): string {
  const { stageLines, narrationLines, speeches, parentScene } = args
  const dialogueTexts = new Set(speeches.map((s) => (s.text || '').trim()))

  // 1) Prefer stage (directions)
  const stageText = normalizeShort(joinBestSentences(stageLines.map((l) => l.text || '')))
  if (stageText && stageText.length > 0) return stageText

  // 2) Fallback to narration if it doesn't duplicate dialogue text
  const narr = narrationLines.map((l) => l.text || '')
  const narrPick = pickSentenceAvoidingSet(narr, dialogueTexts)
  if (narrPick) return narrPick

  // 3) Scene meta
  const meta = [parentScene?.setting, parentScene?.description]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(' / ')
  if (meta) return meta

  // 4) Last resort: speaker fallback
  return deriveSpeakerFallback(speeches)
}

function deriveSpeakerFallback(speeches: ScriptLine[]): string {
  const names = Array.from(
    new Set(speeches.map((s) => (s.speaker || '').trim()).filter((s): s is string => s.length > 0)),
  )
  if (names.length === 0) return '…'
  if (names.length === 1) return `${names[0]}`
  if (names.length === 2) return `${names[0]}と${names[1]}`
  return `${names[0]}たち`
}

function normalizeShort(s: string, max = 80): string {
  const t = (s || '').trim()
  if (!t) return ''
  return t.length > max ? t.slice(0, max) : t
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/\n|(?<=[。！？!?.])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function joinBestSentences(lines: string[], max = 80): string {
  const parts = lines.flatMap(splitIntoSentences)
  const uniq: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const t = p.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    uniq.push(t)
    const joined = uniq.join(' / ')
    if (joined.length >= 20) return joined.slice(0, max)
  }
  return uniq.join(' / ').slice(0, max)
}

function pickSentenceAvoidingSet(lines: string[], avoid: Set<string>, max = 80): string {
  for (const line of lines) {
    const parts = splitIntoSentences(line)
    for (const part of parts) {
      const t = part.trim()
      if (t && !avoid.has(t)) return t.length > max ? t.slice(0, max) : t
    }
  }
  return ''
}

function pickAlternateSentence(text: string, accept: (s: string) => boolean, max = 80): string {
  const parts = splitIntoSentences(text)
  for (const p of parts) {
    const t = p.trim()
    if (t && accept(t)) return t.length > max ? t.slice(0, max) : t
  }
  return ''
}

export function buildLayoutFromPageBreaks(
  pageBreaks: PageBreakPlan,
  episodeMeta: { title: string; episodeNumber: number; episodeTitle?: string },
): MangaLayout {
  const recentContentGlobal = new Set<string>()
  const pages = pageBreaks.pages.map((p) => {
    const template = selectLayoutTemplateByCountRandom(Math.max(1, p.panelCount))
    let nextId = 1
    const usedContentInPage = new Set<string>()
    const panels: Panel[] = p.panels.map((pp, idx) => {
      // 新しい形式からcontentとdialogueを直接取得
      let content = pp.content || ''
      const dialogueArr = Array.isArray(pp.dialogue) ? pp.dialogue : []
      let dialogues: Dialogue[] = dialogueArr.map((d) => ({
        speaker: d.speaker,
        text:
          (d as { text?: string; lines?: string }).text ?? (d as { lines?: string }).lines ?? '',
      }))
      // セリフ0〜2制約（配列長で抑制、詳しいtypeは既存型に委ねる）
      if (dialogues.length > 2) {
        dialogues = dialogues.slice(0, 2)
      }

      // 空コマ禁止: content が空 or セリフ本文と同一の場合、話者名などで補完（thingsToBeDrawn の意味付け）
      const dialogueTexts = new Set(dialogues.map((d) => (d.text || '').trim()))
      if (!content || content.trim().length === 0 || dialogueTexts.has(content.trim())) {
        const names = Array.from(
          new Set(dialogues.map((d) => (d.speaker || '').trim()).filter((n) => n.length > 0)),
        )
        if (names.length === 0) {
          content = '…'
        } else if (names.length === 1) {
          content = `${names[0]}`
        } else if (names.length === 2) {
          content = `${names[0]}と${names[1]}`
        } else {
          content = `${names[0]}たち`
        }
      }

      // 重複 content 抑制（ページ内/全体）
      if (usedContentInPage.has(content) || recentContentGlobal.has(content)) {
        const altParts = content
          .split(/\n|。|！|？|\.|!|\?/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !usedContentInPage.has(s) && !recentContentGlobal.has(s))
        const names = Array.from(
          new Set(dialogues.map((d) => (d.speaker || '').trim()).filter((n) => n.length > 0)),
        )
        const speakerFallback =
          names.length === 0
            ? '…'
            : names.length === 1
              ? names[0]
              : names.length === 2
                ? `${names[0]}と${names[1]}`
                : `${names[0]}たち`
        content = altParts[0] || speakerFallback
      }
      usedContentInPage.add(content)
      recentContentGlobal.add(content)

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
