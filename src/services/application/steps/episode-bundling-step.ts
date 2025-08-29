import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface EpisodeBundlingResult {
  episodes: number[]
}

export class EpisodeBundlingStep implements PipelineStep {
  readonly stepName = 'episode-bundling'

  async bundleFromFullPages(
    context: StepContext,
  ): Promise<StepExecutionResult<EpisodeBundlingResult>> {
    const { jobId, logger } = context
    try {
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const layoutStorage = await StorageFactory.getLayoutStorage()
      const full = await layoutStorage.get(JsonStorageKeys.fullPages(jobId))
      if (!full) {
        throw new Error('full_pages.json not found; ensure page-break step saved it')
      }
      const fullLayout = JSON.parse(full.text) as {
        pages: Array<{
          page_number: number
          panels: Array<{ dialogues?: Array<{ text: string }> }>
        }>
      }
      const totalPages = Array.isArray(fullLayout.pages) ? fullLayout.pages.length : 0
      if (totalPages === 0) throw new Error('No pages in full layout')

      // Build pages summary for prompt（軽量）。
      const pagesSummary = fullLayout.pages.map((p, idx) => ({
        page: idx + 1,
        panels: p.panels?.length || 0,
        speechLines: (p.panels || []).reduce((acc, pn) => acc + (pn.dialogues?.length || 0), 0),
      }))

      // LLM提案: 入力が大きい可能性があるためウィンドウ分割してforループで与える
      const generator = getLlmStructuredGenerator()
      const appCfg = getAppConfigWithOverrides()
      const eb =
        'episodeBundling' in appCfg.llm
          ? appCfg.llm.episodeBundling
          : { systemPrompt: '', userPromptTemplate: '' }
      const schema = z
        .object({
          episodes: z
            .array(
              z
                .object({
                  startPage: z.number().int().positive(),
                  endPage: z.number().int().positive(),
                })
                .refine((v) => v.endPage >= v.startPage, {
                  message: 'endPage must be >= startPage',
                }),
            )
            .default([]),
          rationale: z.array(z.string()).optional(),
        })
        .strip()

      const WINDOW = 120
      const OVERLAP = 20
      const proposed: Array<{ start: number; end: number }> = []
      for (let s = 1; s <= totalPages; s += WINDOW - OVERLAP) {
        const e = Math.min(totalPages, s + WINDOW - 1)
        const windowSummary = pagesSummary.slice(s - 1, e)
        const prompt = (eb.userPromptTemplate || '')
          .replace('{{totalPages}}', String(totalPages))
          .replace('{{windowStart}}', String(s))
          .replace('{{windowEnd}}', String(e))
          .replace('{{pagesSummary}}', JSON.stringify(windowSummary))

        const res = await generator.generateObjectWithFallback({
          name: 'episode-bundling',
          systemPrompt: eb.systemPrompt,
          userPrompt: prompt,
          schema: schema as unknown as z.ZodTypeAny,
          schemaName: 'EpisodeBundling',
        })
        const episodes = Array.isArray(res?.episodes)
          ? (res.episodes as Array<{ startPage: number; endPage: number }>)
          : []
        for (const ep of episodes) {
          // 絶対ページ番号で返すようにプロンプトするが、相対値の可能性も考慮して補正
          let start = ep.startPage
          let end = ep.endPage
          if (start >= 1 && end >= 1 && start <= e - s + 1 && end <= e - s + 1) {
            start = s + start - 1
            end = s + end - 1
          }
          if (start < 1 || end < 1 || start > totalPages || end > totalPages) continue
          if (end < start) continue
          proposed.push({ start, end })
        }
      }

      // 正規化: 重複/交差をマージ
      proposed.sort((a, b) => a.start - b.start || a.end - b.end)
      const merged: Array<{ start: number; end: number }> = []
      for (const r of proposed) {
        if (merged.length === 0) {
          merged.push({ ...r })
          continue
        }
        const last = merged[merged.length - 1]
        if (r.start <= last.end) {
          last.end = Math.max(last.end, r.end)
        } else {
          merged.push({ ...r })
        }
      }

      // 目安適用: 20–50ページに収まるように分割・結合（厳密なバリデーションはしない）
      const MIN = 20
      const MAX = 50
      const ranges: Array<{ start: number; end: number }> = []
      for (const seg of merged) {
        let a = seg.start
        while (a <= seg.end) {
          let b = Math.min(seg.end, a + MAX - 1)
          const len = b - a + 1
          if (len < MIN) {
            // 次のセグメントに寄せて拡張（可能なら）
            const next = merged.find((m) => m.start > b)
            if (next && next.start - a + 1 >= MIN) {
              b = Math.min(a + MAX - 1, next.start - 1)
            }
          }
          // 最終保護: 下限未満なら残余をまとめて最後に扱う
          if (b - a + 1 < MIN && a === seg.start && seg.end - seg.start + 1 >= MIN) {
            b = Math.min(seg.end, a + MIN - 1)
          }
          if (b >= a) ranges.push({ start: a, end: b })
          a = b + 1
        }
      }
      // 端数吸収: 最終エピソードがMIN未満なら直前に吸収（複数あれば末尾のみ吸収）
      if (ranges.length >= 2) {
        const last = ranges[ranges.length - 1]
        const lastLen = last.end - last.start + 1
        if (lastLen < MIN) {
          ranges[ranges.length - 2].end = last.end
          ranges.pop()
          logger.info('Merged short tail episode into previous (post-bundle correction)', {
            jobId,
            mergedTo: ranges[ranges.length - 1],
          })
        }
      }
      if (ranges.length === 0) {
        // ガイドラインに沿った範囲が検出できなかった場合でも弾かない。
        // 全ページを1エピソードとして扱うフォールバックを適用し、警告のみを記録する。
        logger.warn('No episode ranges proposed; falling back to single-episode bundle', {
          jobId,
          totalPages,
          guideline: '20-50 pages (advisory)',
        })
        ranges.push({ start: 1, end: totalPages })
      }

      // Persist bundling JSON for resume/debug
      try {
        const analysisStorage = await (
          await import('@/utils/storage')
        ).StorageFactory.getAnalysisStorage()
        await analysisStorage.put(
          (await import('@/utils/storage')).JsonStorageKeys.episodeBundling(jobId),
          JSON.stringify({ totalPages, episodes: ranges }, null, 2),
          { contentType: 'application/json; charset=utf-8', jobId },
        )
      } catch (e) {
        logger.warn('Failed to store episode_bundling.json (continuing)', {
          error: e instanceof Error ? e.message : String(e),
        })
      }

      // Write per-episode layout JSON
      const ports = getStoragePorts()
      const episodes: number[] = []

      let epNo = 1
      for (const r of ranges) {
        const epLayout = {
          ...fullLayout,
          pages: fullLayout.pages.slice(r.start - 1, r.end),
          episodeNumber: epNo,
          episodeTitle: `エピソード${epNo}`,
        }
        await ports.layout.putEpisodeLayout(jobId, epNo, JSON.stringify(epLayout, null, 2))
        episodes.push(epNo)
        epNo++
      }

      return { success: true, data: { episodes } }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      context.logger.error('Episode bundling failed', { jobId: context.jobId, error: msg })
      return { success: false, error: msg }
    }
  }
}
