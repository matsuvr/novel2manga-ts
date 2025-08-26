import { estimatePageBreaks } from '@/agents/script/page-break-estimator'
import { assignPanels, buildLayoutFromAssignment } from '@/agents/script/panel-assignment'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PageBreakPlan, Script, PanelAssignmentPlan } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface PageBreakResult {
  pageBreakPlan: PageBreakPlan
  totalPages: number
}

/**
 * Step responsible for page break estimation and layout storage
 */
export class PageBreakStep implements PipelineStep {
  readonly stepName = 'page-break'

  /**
   * Estimate page breaks and store layout plan
   */
  async estimatePageBreaks(
    script: unknown,
    episodeNumber: number,
    context: StepContext,
  ): Promise<StepExecutionResult<PageBreakResult>> {
    const { jobId, logger } = context

    try {
      logger.info('Starting page break estimation', {
        jobId,
        episodeNumber,
      })

      // Estimate page breaks using advanced LLM without mechanical page count logic
      // ここで「LLM（またはエージェント）を呼び出してページ割り（コマ割り）を推定」
      let pageBreakPlan = await estimatePageBreaks(
        script as Parameters<typeof estimatePageBreaks>[0],
        {
          jobId,
          episodeNumber,
        },
      )

      if (!pageBreakPlan) {
        throw new Error('Page break estimation failed: pageBreakPlan is undefined')
      }

      // Enforce panel count upper bound (1..6) per template availability
      pageBreakPlan = {
        pages: pageBreakPlan.pages.map((p) => ({
          ...p,
          panelCount: Math.max(1, Math.min(6, p.panelCount || 1)),
        })),
      }

      // ===== Enforce full coverage: assign every script line to panels =====
      // 前段の Script は構造化済み（フラグメント経路では index を必ず付与）を前提にする
      const structuredScript = script as Script
      // 欠落 index を補完して正規化
      let nextIndex = 1
      for (const scene of structuredScript.scenes || []) {
        for (const line of scene.script || []) {
          if (typeof line.index !== 'number' || !Number.isFinite(line.index)) {
            line.index = nextIndex++
          } else {
            nextIndex = Math.max(nextIndex, line.index + 1)
          }
        }
      }

      // 1) LLMのページ割り結果に基づき、各パネルへ script 行 index を割当（LLM出力の要約/間引きを使用しない）
      let assignment: PanelAssignmentPlan
      try {
        logger.info('Starting panel assignment', {
          jobId,
          episodeNumber,
          scriptScenes: structuredScript.scenes?.length || 0,
          pageBreakPages: pageBreakPlan.pages.length,
        })

        assignment = await assignPanels(structuredScript, pageBreakPlan, {
          jobId,
          episodeNumber,
        })

        logger.info('Panel assignment completed', {
          jobId,
          episodeNumber,
          assignmentPages: assignment?.pages?.length || 0,
        })
      } catch (error) {
        logger.error('Panel assignment failed with error', {
          jobId,
          episodeNumber,
          error: error instanceof Error ? error.message : String(error),
        })
        throw new Error(
          `Panel assignment failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if (!assignment) {
        logger.error('Panel assignment returned undefined', {
          jobId,
          episodeNumber,
        })
        throw new Error('Panel assignment failed: assignment is undefined')
      }

      if (!assignment.pages || !Array.isArray(assignment.pages)) {
        throw new Error('Panel assignment failed: assignment.pages is not an array')
      }

      // 2) カバレッジ検証: すべての script 行 index が割り当て済みか確認
      const allLines = (structuredScript.scenes || []).flatMap((s) => s.script || [])
      // index が未定義の行は、順序に基づき一時的に 1..N を採番して検証対象に含める
      const indexedAll: Array<{ idx: number }> = []
      let fallbackCounter = 1
      for (const line of allLines) {
        const idx =
          typeof line.index === 'number' && Number.isFinite(line.index)
            ? line.index
            : fallbackCounter++
        indexedAll.push({ idx })
      }
      const allIdxSet = new Set(indexedAll.map((x) => x.idx))
      // Optimize nested flatMap by using a single loop
      const assignedLines: number[] = []
      for (const page of assignment.pages) {
        for (const panel of page.panels) {
          if (Array.isArray(panel.lines)) {
            assignedLines.push(...panel.lines)
          }
        }
      }
      const assignedIdxSet = new Set(assignedLines)
      let unassigned: number[] = Array.from(allIdxSet).filter((i) => !assignedIdxSet.has(i))

      // 2.5) 空パネルをまず未割当行で埋める（少なくとも1行は必ず割当）
      if (unassigned.length > 0) {
        for (const page of assignment.pages) {
          for (const panel of page.panels) {
            if (!panel.lines || panel.lines.length === 0) {
              const take = unassigned.shift()
              if (typeof take === 'number') {
                panel.lines = [take]
              }
              if (unassigned.length === 0) break
            }
          }
          if (unassigned.length === 0) break
        }
        // 再計算: まだ未割当が残っていれば後続の追加ページで吸収
        if (unassigned.length > 0) {
          const used = new Set(assignment.pages.flatMap((p) => p.panels.flatMap((pp) => pp.lines)))
          unassigned = Array.from(allIdxSet).filter((i) => !used.has(i))
        }
      }

      // 3) 未割当があれば、追加ページを生成して強制割当（1コマ=1行を基本に安全に割当）
      if (unassigned.length > 0) {
        // 既存の最大ページ番号を取得
        const maxPageNumber = assignment.pages.reduce(
          (m, p) => (p.pageNumber > m ? p.pageNumber : m),
          0,
        )
        // 1ページあたりの最大コマ数（スキーマ上限: 8）
        const PANELS_PER_PAGE = 6
        let cursor = 0
        let pageNo = maxPageNumber

        while (cursor < unassigned.length) {
          pageNo += 1
          const chunk = unassigned.slice(cursor, cursor + PANELS_PER_PAGE)
          cursor += chunk.length
          assignment.pages.push({
            pageNumber: pageNo,
            panelCount: chunk.length,
            panels: chunk.map((lineIdx, i) => ({ id: i + 1, lines: [lineIdx] })),
          })
        }
      }

      // 4) 最終レイアウトを生成（台本の各行テキストをそのまま使用。要約/省略なし）
      const layout = buildLayoutFromAssignment(structuredScript, assignment, {
        title: `Episode ${episodeNumber}`,
        episodeNumber,
        episodeTitle: undefined,
      })

      // Store final layout JSON (per-episode) and also save full pages snapshot for bundling
      const ports = getStoragePorts()
      const layoutJson = JSON.stringify(layout, null, 2)
      await ports.layout.putEpisodeLayout(jobId, episodeNumber, layoutJson)

      // Additionally store a job-scoped full pages plan to support bundling step
      try {
        const { StorageFactory } = await import('@/utils/storage')
        const storage = await StorageFactory.getLayoutStorage()
        const { JsonStorageKeys } = await import('@/utils/storage')
        await storage.put(JsonStorageKeys.fullPages(jobId), layoutJson, {
          contentType: 'application/json; charset=utf-8',
          jobId,
          episode: String(episodeNumber),
        })
      } catch (e) {
        logger.warn('Failed to store full pages snapshot (continuing)', {
          jobId,
          episodeNumber,
          error: e instanceof Error ? e.message : String(e),
        })
      }

      // Count total pages for this episode
      const totalPages = layout.pages.length

      logger.info('Page break estimation completed', {
        jobId,
        episodeNumber,
        pagesInEpisode: totalPages,
      })

      return {
        success: true,
        data: {
          pageBreakPlan,
          totalPages,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Page break estimation failed', {
        jobId,
        episodeNumber,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
