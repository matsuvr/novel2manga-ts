import { z } from 'zod'
import { CompatAgent } from '@/agents/compat'
import { getLLMDefaultProvider, getNarrativeAnalysisConfig } from '@/config'
import type { ChunkAnalysisResult } from '@/types/chunk'
import type { PageBatchPlan } from '@/types/page-splitting'
import type { EpisodeData } from '@/types/panel-layout'

const pageBatchPlanSchema = z.object({
  episodeNumber: z.number(),
  startPage: z.number(),
  plannedPages: z.array(
    z.object({
      pageNumber: z.number(),
      summary: z.string(),
      importance: z.number(),
      segments: z.array(
        z.object({
          contentHint: z.string(),
          importance: z.number(),
          source: z.object({
            chunkIndex: z.number(),
            startOffset: z.number(),
            endOffset: z.number(),
          }),
        }),
      ),
    }),
  ),
  mayAdjustPreviousPages: z.boolean(),
  remainingPagesEstimate: z.number().int().min(0),
})

export class PageSplitAgent {
  private compat: CompatAgent

  constructor() {
    const provider = getLLMDefaultProvider()
    const narrative = getNarrativeAnalysisConfig()
    this.compat = new CompatAgent({
      name: 'page-split-agent',
      instructions:
        narrative.systemPrompt +
        '\nYou are now a manga pagination planner that outputs compact 3-page batches based on narrative arc analysis.',
      provider,
      // maxTokens removed - use llm.config.ts value
    })
  }

  async planNextBatch(
    episodeData: EpisodeData,
    options: {
      batchSize: number
      allowMinorAdjustments: boolean
      startPage: number
      backEditWindow?: number // allow planner to revise up to N previous pages
      jobId?: string // トークン使用量記録用
    },
  ): Promise<PageBatchPlan> {
    console.log('[PageSplitAgent] planNextBatch called with options:', options)
    // Apply narrative arc analysis logic for better page splitting
    const narrativeAnalysis = await this.analyzeNarrativeFlow(episodeData)

    // Build compact input using analyses and episode summary with narrative insights
    const compact = {
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      episodeSummary: episodeData.episodeSummary,
      narrativeFlow: narrativeAnalysis,
      chunkSummaries: episodeData.chunks.map((chunk, i) => {
        // Cast to the correct ChunkAnalysisResult type
        const analysis = chunk.analysis as unknown as ChunkAnalysisResult
        return {
          idx: i,
          characters: (analysis?.characters || []).map((c) => c.name || '').slice(0, 6),
          dialogues: (analysis?.dialogues || []).length,
          scenes: (analysis?.scenes || []).map((s) => s.description || '').slice(0, 3),
          highlights: (analysis?.highlights || [])
            .sort((x, y) => (y.importance ?? 0) - (x.importance ?? 0))
            .slice(0, 3)
            .map((h) => ({ t: h.content || '', imp: h.importance ?? 5 })),
          tension: analysis?.narrativeElements?.tension || 5,
          pacing: analysis?.narrativeElements?.pacing || 'medium',
          emotionalTone: analysis?.narrativeElements?.emotionalTone || 'neutral',
        }
      }),
    }

    const backEdit = Math.max(0, options.backEditWindow ?? 0)
    const userPrompt = `
目的: 次の${options.batchSize}ページ分の明確なページ境界案を出してください。
ナラティブアーク分析に基づき、シーンの流れと感情の起伏を考慮して最適なページ分割を行ってください。

制約:
- 出力は指定のJSONスキーマに厳密に従うこと。
- 原則、ページ番号は ${options.startPage} からの連番を計画すること。
- ただし直前の最大 ${backEdit} ページまでは、必要に応じて再計画(上書き)してよい。
- 再計画する場合は mayAdjustPreviousPages=true を設定し、該当ページ番号の plan を含めて返すこと。
- 返すのは「再計画対象(最大${backEdit}ページ) + 次の${options.batchSize}ページ」のみ。
- それ以外のページは決して出力しないこと。
- 微調整は ${options.allowMinorAdjustments ? '許可' : '非許可'}。
- シーンの切り替わり、クライマックス、感情の変化点をページ境界として優先すること。
- 各ページに適切な重要度とパネル配分のヒントを含めること。

入力(要約):
${JSON.stringify(compact, null, 2)}

厳格な出力制約（絶対遵守）:
- mayAdjustPreviousPages は true か false のいずれかのみ。null/未定義/その他の値は禁止。
- remainingPagesEstimate は 0 以上の整数のみ。null/未定義/小数/文字列は禁止。
- 上記に違反した場合、出力は不正と見なされます。
`

    console.log('[PageSplitAgent] About to call generateObject with pageBatchPlanSchema')
    const result = await this.compat.generateObject<PageBatchPlan>({
      userPrompt,
      schema: pageBatchPlanSchema,
      schemaName: 'PageBatchPlan',
      options: {
        maxRetries: 0,
        jobId: options.jobId,
        stepName: 'page-split',
      },
    })

    return result
  }

  private async analyzeNarrativeFlow(episodeData: EpisodeData): Promise<{
    overallTension: number
    pacing: 'slow' | 'medium' | 'fast'
    emotionalArcs: Array<{
      startChunk: number
      endChunk: number
      emotion: string
      intensity: number
    }>
    sceneBreaks: Array<{
      chunkIndex: number
      breakType: 'minor' | 'major' | 'climax'
      reason: string
    }>
    recommendedPageBreaks: Array<{
      position: number // chunk index where page break is recommended
      confidence: number
      reason: string
    }>
  }> {
    // EpisodeData.chunks内のanalysisデータを使用
    const chunksWithAnalysis = episodeData.chunks.map((chunk) => ({
      ...chunk,
      analysis: chunk.analysis as unknown as ChunkAnalysisResult,
    }))

    // Analyze narrative tension and pacing across chunks
    const chunkTensions = chunksWithAnalysis.map((chunk, i) => ({
      index: i,
      tension: chunk.analysis?.narrativeElements?.tension || 5,
      pacing: chunk.analysis?.narrativeElements?.pacing || 'medium',
      tone: chunk.analysis?.narrativeElements?.emotionalTone || 'neutral',
      highlightCount: (chunk.analysis?.highlights || []).filter((h) => (h.importance || 0) >= 7)
        .length,
    }))

    const overallTension =
      chunkTensions.reduce((sum, c) => sum + c.tension, 0) / chunkTensions.length

    // Identify emotional arcs
    const emotionalArcs: Array<{
      startChunk: number
      endChunk: number
      emotion: string
      intensity: number
    }> = []

    let currentArc: {
      start: number
      emotion: string
      intensity: number
    } | null = null
    for (let i = 0; i < chunkTensions.length; i++) {
      const chunk = chunkTensions[i]
      if (!currentArc || currentArc.emotion !== chunk.tone) {
        if (currentArc) {
          emotionalArcs.push({
            startChunk: currentArc.start,
            endChunk: i - 1,
            emotion: currentArc.emotion,
            intensity: currentArc.intensity,
          })
        }
        currentArc = {
          start: i,
          emotion: chunk.tone,
          intensity: chunk.tension,
        }
      } else {
        currentArc.intensity = Math.max(currentArc.intensity, chunk.tension)
      }
    }
    if (currentArc) {
      emotionalArcs.push({
        startChunk: currentArc.start,
        endChunk: chunkTensions.length - 1,
        emotion: currentArc.emotion,
        intensity: currentArc.intensity,
      })
    }

    // Identify scene breaks based on location changes and dialogue patterns
    const sceneBreaks: Array<{
      chunkIndex: number
      breakType: 'minor' | 'major' | 'climax'
      reason: string
    }> = []

    for (let i = 1; i < chunksWithAnalysis.length; i++) {
      const prev = chunksWithAnalysis[i - 1]
      const curr = chunksWithAnalysis[i]

      const prevScenes = prev.analysis?.scenes || []
      const currScenes = curr.analysis?.scenes || []

      // Location change detection
      const locationChanged =
        prevScenes.length > 0 &&
        currScenes.length > 0 &&
        prevScenes[0].location !== currScenes[0].location

      // High importance highlight detection
      const hasClimaxMoment = (curr.analysis?.highlights || []).some(
        (h) => (h.importance || 0) >= 9,
      )

      // Tension spike detection
      const tensionSpike =
        (curr.analysis?.narrativeElements?.tension || 5) -
          (prev.analysis?.narrativeElements?.tension || 5) >=
        3

      if (hasClimaxMoment) {
        sceneBreaks.push({
          chunkIndex: i,
          breakType: 'climax',
          reason: 'High importance narrative moment detected',
        })
      } else if (locationChanged && tensionSpike) {
        sceneBreaks.push({
          chunkIndex: i,
          breakType: 'major',
          reason: 'Location change with tension increase',
        })
      } else if (locationChanged) {
        sceneBreaks.push({
          chunkIndex: i,
          breakType: 'minor',
          reason: 'Scene location change',
        })
      }
    }

    // Generate recommended page breaks based on narrative analysis
    const recommendedPageBreaks: Array<{
      position: number
      confidence: number
      reason: string
    }> = []

    // Page breaks at scene breaks
    for (const sceneBreak of sceneBreaks) {
      const confidence =
        sceneBreak.breakType === 'climax' ? 0.9 : sceneBreak.breakType === 'major' ? 0.8 : 0.6
      recommendedPageBreaks.push({
        position: sceneBreak.chunkIndex,
        confidence,
        reason: `Scene break: ${sceneBreak.reason}`,
      })
    }

    // Page breaks at emotional arc transitions
    for (const arc of emotionalArcs) {
      if (arc.intensity >= 8) {
        recommendedPageBreaks.push({
          position: arc.startChunk,
          confidence: 0.7,
          reason: `High-intensity emotional arc begins`,
        })
      }
    }

    // Determine overall pacing
    const fastPacingCount = chunkTensions.filter((c) => c.pacing === 'fast').length
    const slowPacingCount = chunkTensions.filter((c) => c.pacing === 'slow').length
    const pacing =
      fastPacingCount > slowPacingCount
        ? 'fast'
        : slowPacingCount > fastPacingCount
          ? 'slow'
          : 'medium'

    return {
      overallTension,
      pacing,
      emotionalArcs,
      sceneBreaks,
      recommendedPageBreaks: recommendedPageBreaks.sort((a, b) => b.confidence - a.confidence),
    }
  }
}
