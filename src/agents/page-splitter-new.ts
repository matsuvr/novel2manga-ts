import { z } from 'zod'
import { CompatAgent } from '@/agents/compat'
import { getLLMDefaultProvider, getNarrativeAnalysisConfig } from '@/config'
import type { LLMProvider } from '@/llm'
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

export class PageSplitAgentNew {
  private compat: CompatAgent
  private provider: LLMProvider

  constructor() {
    this.provider = getLLMDefaultProvider()
    const narrative = getNarrativeAnalysisConfig()
    this.compat = new CompatAgent({
      name: 'page-split-agent-new',
      instructions:
        narrative.systemPrompt +
        '\nYou are now a manga pagination planner that outputs compact 3-page batches based on narrative arc analysis.',
      provider: this.provider,
      // maxTokens removed - use llm.config.ts value
    })
  }

  async planNextBatch(
    episodeData: EpisodeData,
    options: {
      batchSize: number
      allowMinorAdjustments: boolean
      startPage: number
      backEditWindow?: number
      jobId?: string
    },
  ): Promise<PageBatchPlan> {
    console.log('[PageSplitAgentNew] planNextBatch called with options:', options)

    const _narrative = getNarrativeAnalysisConfig()
    const narrativeAnalysis = await this.analyzeNarrativeFlow(episodeData)

    // コンパクトな入力データを構築
    const compact = {
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      episodeSummary: episodeData.episodeSummary,
      narrativeFlow: narrativeAnalysis,
      chunkSummaries: episodeData.chunks.map((chunk, i) => {
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

エピソード情報:
${JSON.stringify(compact, null, 2)}

JSONスキーマ:
${JSON.stringify(pageBatchPlanSchema.shape, null, 2)}
`

    try {
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
    } catch (error) {
      console.error('[PageSplitAgentNew] Error in planNextBatch:', error)
      throw error
    }
  }

  private async analyzeNarrativeFlow(_episodeData: EpisodeData) {
    // 既存のナラティブフロー分析ロジックを移植
    // この部分は既存のコードから移植する必要があります
    return {
      tension: 'medium',
      pacing: 'steady',
      emotionalTone: 'neutral',
    }
  }

  // 既存のAPIとの互換性のため
  getCore() {
    return this.compat.getCore()
  }
}
