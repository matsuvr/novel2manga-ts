import type { Dialogue, MangaLayout, Panel } from '@/types/panel-layout'
import type { NewMangaScript, PageBreakV2, PanelAssignmentPlan } from '@/types/script'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'

export async function assignPanels(
  _script: NewMangaScript,
  pageBreaks: PageBreakV2,
  _opts?: { jobId?: string; episodeNumber?: number; maxElementChars?: number },
): Promise<PanelAssignmentPlan> {
  // PageBreakV2からPanelAssignmentPlanに変換
  const pageMap = new Map<number, number[]>()

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
    panels: panelIndexes.map((panelIndex) => ({
      id: panelIndex,
      scriptIndexes: [panelIndex - 1], // パネルインデックスをスクリプトインデックスとしてマッピング
    })),
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

  const pages = Array.from(pageMap.entries()).map(([pageNumber, panelsInPage]) => {
    const template = selectLayoutTemplateByCountRandom(Math.max(1, panelsInPage.length))
    let nextId = 1
    const usedContentInPage = new Set<string>()
    const panels: Panel[] = panelsInPage.map((pp, idx) => {
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

    return { page_number: pageNumber, panels }
  })

  return {
    title: episodeMeta.episodeTitle || `エピソード${episodeMeta.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeMeta.episodeNumber,
    episodeTitle: episodeMeta.episodeTitle,
    pages,
  }
}
