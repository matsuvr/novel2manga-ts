import type { Dialogue, MangaLayout, Panel } from '@/types/panel-layout'
import type { NewMangaScript, PageBreakV2, PanelAssignmentPlan } from '@/types/script'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'
import {
  type ImportanceCandidate,
  normalizeImportanceDistribution,
} from '@/utils/panel-importance'

export async function assignPanels(
  _script: NewMangaScript,
  pageBreaks: PageBreakV2,
  _opts?: { jobId?: string; episodeNumber?: number; maxElementChars?: number },
): Promise<PanelAssignmentPlan> {
  // PageBreakV2からPanelAssignmentPlanに変換
  const pageMap = new Map<number, number[]>()
  const totalScriptPanels = Array.isArray(_script?.panels) ? _script.panels.length : 0
  const clampToScriptRange = (oneBasedIndex: number): number => {
    if (totalScriptPanels <= 0) return Math.max(1, oneBasedIndex)
    if (oneBasedIndex < 1) return 1
    if (oneBasedIndex > totalScriptPanels) return totalScriptPanels
    return oneBasedIndex
  }

  for (const panel of pageBreaks.panels) {
    if (!pageMap.has(panel.pageNumber)) {
      pageMap.set(panel.pageNumber, [])
    }
    const panels = pageMap.get(panel.pageNumber)
    if (panels) {
      panels.push(panel.panelIndex)
    }
  }

  const pages = Array.from(pageMap.entries()).map(([pageNumber, panelIndexes]) => ({
    pageNumber,
    panelCount: panelIndexes.length,
    panels: panelIndexes.map((panelIndex) => {
      const safeIndex = clampToScriptRange(panelIndex)
      return {
        id: panelIndex,
        // 1-based のインデックスを維持。スクリプト範囲外はクランプして常に非空を保証
        scriptIndexes: [safeIndex],
      }
    }),
  }))

  return { pages }
}

// 簡素化された関数 - PageBreakV2から直接レイアウトを生成
export function buildLayoutFromPageBreakV2(
  pageBreaks: PageBreakV2,
  episodeMeta: { title: string; episodeNumber: number; episodeTitle?: string },
): MangaLayout {
  // buildLayoutFromPageBreaks関数と同じ実装を使用
  return buildLayoutFromPageBreaks(pageBreaks, episodeMeta)
}

// 旧形式のbuildLayoutFromAssignmentは簡素化
export function buildLayoutFromAssignment(
  _script: NewMangaScript,
  _assignment: PanelAssignmentPlan,
  episodeMeta: { title: string; episodeNumber: number; episodeTitle?: string },
): MangaLayout {
  // 互換性のため空のレイアウトを返す
  return {
    title: episodeMeta.episodeTitle || `エピソード${episodeMeta.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeMeta.episodeNumber,
    episodeTitle: episodeMeta.episodeTitle,
    pages: [],
  }
}

export function buildLayoutFromPageBreaks(
  pageBreaks: PageBreakV2,
  episodeMeta: { title: string; episodeNumber: number; episodeTitle?: string },
): MangaLayout {
  const recentContentGlobal = new Set<string>()

  // PageBreakV2の構造に合わせて、panelをページごとにグループ化
  const pageMap = new Map<number, (typeof pageBreaks.panels)[0][]>()
  for (const panel of pageBreaks.panels) {
    if (!pageMap.has(panel.pageNumber)) {
      pageMap.set(panel.pageNumber, [])
    }
    const panels = pageMap.get(panel.pageNumber)
    if (panels) {
      panels.push(panel)
    }
  }

  const importanceCandidates: ImportanceCandidate[] = []
  const panelIndexMatrix: number[][] = []

  const rawPages = Array.from(pageMap.entries()).map(([pageNumber, panelsInPage]) => {
    const template = selectLayoutTemplateByCountRandom(Math.max(1, panelsInPage.length))
    let nextId = 1
    const usedContentInPage = new Set<string>()
    const panelIndicesForPage: number[] = []
    const panels: Panel[] = panelsInPage.map((pp, idx) => {
      // 新しい形式からcontentとdialogueを直接取得
      let content = pp.content || ''
      const dialogueArr = Array.isArray(pp.dialogue) ? pp.dialogue : []
      let dialogues: Dialogue[] = dialogueArr.map((d) => ({
        speaker: d.speaker,
        text:
          (d as { text?: string; lines?: string }).text ?? (d as { lines?: string }).lines ?? '',
        // PageBreakV2 の dialogue 要素に type があれば引き継ぐ（後段の書体選択に使用）
        ...((d as { type?: 'speech' | 'thought' | 'narration' }).type
          ? { type: (d as { type?: 'speech' | 'thought' | 'narration' }).type }
          : {}),
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

      // Extract SFX data from the panel
      const sfx = Array.isArray(pp.sfx) ? pp.sfx : []

      const shape = template.panels[idx % template.panels.length]

      const candidateIndex = importanceCandidates.length
      // Named constants for highlight importance calculation
      const RAW_IMPORTANCE_MIN = 3
      const RAW_IMPORTANCE_MAX = 10
      const DIALOGUE_COUNT_THRESHOLD = 2
      const DIALOGUE_HEAVY_IMPORTANCE = 7
      const CONTENT_LENGTH_THRESHOLD = 50
      const CONTENT_HEAVY_IMPORTANCE = 6
      const DEFAULT_RAW_IMPORTANCE = 5

      const highlightBasedImportance = Math.min(
        RAW_IMPORTANCE_MAX,
        Math.max(
          RAW_IMPORTANCE_MIN,
          dialogues.filter((d) => d.type === 'speech' || d.type === 'thought').length >=
            DIALOGUE_COUNT_THRESHOLD
            ? DIALOGUE_HEAVY_IMPORTANCE
            : content.length >= CONTENT_LENGTH_THRESHOLD
              ? CONTENT_HEAVY_IMPORTANCE
              : DEFAULT_RAW_IMPORTANCE,
        ),
      )

      const dialogueCharCount = dialogues
        .filter((d) => d.type !== 'narration')
        .reduce((acc, d) => acc + ((d.text ?? '').replace(/\s+/g, '').length || 0), 0)
      const narrationCharCount = dialogues
        .filter((d) => d.type === 'narration')
        .reduce((acc, d) => acc + ((d.text ?? '').replace(/\s+/g, '').length || 0), 0)
      const contentLength = content.replace(/\s+/g, '').length

      importanceCandidates.push({
        index: candidateIndex,
        rawImportance: highlightBasedImportance,
        dialogueCharCount,
        narrationCharCount,
        contentLength,
      })
      panelIndicesForPage.push(candidateIndex)

      return {
        id: nextId++,
        position: shape.position,
        size: shape.size,
        content,
        dialogues,
        sfx, // Include SFX in the layout panel
        sourceChunkIndex: 0,
        importance: highlightBasedImportance,
      }
    })

    panelIndexMatrix.push(panelIndicesForPage)
    return { page_number: pageNumber, panels }
  })

  const normalizedAssignments = normalizeImportanceDistribution(importanceCandidates)
  const assignmentMap = new Map(normalizedAssignments.map((entry) => [entry.index, entry.importance]))

  const pages = rawPages.map((page, pageIdx) => {
    const panelIndices = panelIndexMatrix[pageIdx] ?? []
    const normalizedPanels = page.panels.map((panel, panelIdx) => ({
      ...panel,
      importance: assignmentMap.get(panelIndices[panelIdx]) ?? 1,
    }))
    return { page_number: page.page_number, panels: normalizedPanels }
  })

  return {
    title: episodeMeta.episodeTitle || `エピソード${episodeMeta.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeMeta.episodeNumber,
    episodeTitle: episodeMeta.episodeTitle,
    pages,
  }
}
