import { z } from 'zod'
import { BaseAgent } from '@/agents/base-agent'
import { getLayoutGenerationConfig, getLLMDefaultProvider } from '@/config'
import { Page } from '@/domain/models/page'
import type { PageBatchPlan } from '@/types/page-splitting'
import type { EpisodeData, LayoutGenerationConfig, MangaLayout, Panel } from '@/types/panel-layout'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'

// LLMへの入力スキーマは現在使用していないが、将来のバリデーション用に保持
// const layoutGenerationInputSchema = z.object({
//   episodeData: z.object({
//     episodeNumber: z.number(),
//     episodeTitle: z.string().optional(),
//     chunks: z.array(
//       z.object({
//         chunkIndex: z.number(),
//         summary: z.string(),
//         hasHighlight: z.boolean(),
//         highlightImportance: z.number().optional(),
//         dialogueCount: z.number(),
//         sceneDescription: z.string(),
//         characters: z.array(z.string()),
//       }),
//     ),
//   }),
//   targetPages: z.number(),
//   layoutConstraints: z.object({
//     avoidEqualGrid: z.boolean(),
//     preferVariedSizes: z.boolean(),
//     ensureReadingFlow: z.boolean(),
//   }),
// })

// LLMからの出力スキーマ（簡素化: ページごとのコマ数のみ）
const layoutPanelCountOutputSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      panelCount: z.number().int().min(1).max(6),
    }),
  ),
})

export class LayoutGeneratorAgent extends BaseAgent {
  constructor() {
    const config = getLayoutGenerationConfig()
    const provider = getLLMDefaultProvider()

    super({
      name: 'layout-generator',
      instructions: config.systemPrompt,
      provider: provider,
      maxTokens: config.maxTokens,
    })

    console.log(`[layout-generator] Using provider: ${provider}`)
  }

  async generateLayout(
    episodeData: EpisodeData,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: LayoutGenerationConfig,
    options?: { jobId?: string },
  ): Promise<MangaLayout> {
    // エピソードデータをLLM用に簡略化
    // 入力アダプタを使用してLLM入力データを構築
    const { buildLayoutLLMInput } = await import('@/agents/layout/input-adapter')

    // LLMでパネル内容を生成
    const layoutInput = buildLayoutLLMInput(episodeData)

    const config = getLayoutGenerationConfig()
    const prompt = config.userPromptTemplate
      .replace('{{episodeNumber}}', episodeData.episodeNumber.toString())
      .replace('{{layoutInputJson}}', JSON.stringify(layoutInput, null, 2))

    const llmResponseObject = await this.generateObject(
      [{ role: 'user', content: prompt }],
      layoutPanelCountOutputSchema,
      {
        maxRetries: 0,
        jobId: options?.jobId,
        stepName: 'layout',
        episodeNumber: episodeData.episodeNumber,
      },
    )

    // LLMの出力（ページごとのコマ数）を実際のレイアウトに変換
    const pages: { page_number: number; panels: Panel[] }[] = []

    for (const pageData of llmResponseObject.pages) {
      const panelCount = pageData.panelCount
      const template = selectLayoutTemplateByCountRandom(panelCount)

      const page = new Page(pageData.pageNumber)
      // そのままテンプレートを適用。内容は後工程で扱うためプレースホルダ。
      for (let i = 0; i < panelCount; i++) {
        page.addPanel(
          {
            content: '',
            dialogues: undefined,
            sourceChunkIndex: 0,
            importance: 5,
            suggestedSize: 'medium',
          },
          template,
        )
      }

      // テンプレート適用のみ。微調整バリデーションは最小限に保持。
      page.validateLayout()

      pages.push({
        page_number: page.pageNumber,
        panels: page.getPanels().map((p) => p.toJSON()),
      })
    }

    return {
      title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
      created_at: new Date().toISOString().split('T')[0],
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      pages,
    }
  }
}

// メイン関数: レイアウト生成（後方互換性を排除してDRY原則に従う）
export async function generateMangaLayout(
  episodeData: EpisodeData,
  config?: LayoutGenerationConfig,
  options?: { jobId?: string },
): Promise<MangaLayout> {
  const fullConfig: LayoutGenerationConfig = {
    panelsPerPage: {
      min: 1, // 1コマから対応
      max: 8, // 最大数を維持しつつ制限を緩和
      average: 3.5, // 平均値を調整
    },
    dialogueDensity: 0.6,
    visualComplexity: 0.7,
    highlightPanelSizeMultiplier: 2.0,
    readingDirection: 'right-to-left',
    ...config,
  }

  const agent = new LayoutGeneratorAgent()
  return await agent.generateLayout(episodeData, fullConfig, options)
}

// エイリアス（重複排除）
export const generateLayoutWithAgent = generateMangaLayout

// Incremental: generate only specified pages guided by a batch plan
export async function generateMangaLayoutForPlan(
  episodeData: EpisodeData,
  plan: PageBatchPlan,
  _config?: LayoutGenerationConfig,
  options?: { jobId?: string },
): Promise<MangaLayout> {
  const agent = new LayoutGeneratorAgent()

  // Build an input that instructs the model to generate only given pages
  const { buildLayoutLLMInput } = await import('@/agents/layout/input-adapter')
  const layoutInput = buildLayoutLLMInput(episodeData)

  const promptPlan = {
    episodeNumber: plan.episodeNumber,
    pages: plan.plannedPages.map((p) => ({
      pageNumber: p.pageNumber,
      summary: p.summary,
      importance: p.importance,
      // ヒントは与えるが、出力はページごとのコマ数のみ
      segments: p.segments.map((s) => ({
        hint: s.contentHint,
        importance: s.importance,
        source: s.source,
      })),
    })),
  }

  const configPrompts = getLayoutGenerationConfig()
  const prompt = [
    '次の通り、指定したページ番号のみを生成してください。',
    '指定されたページ以外は絶対に出力しないこと。',
    'プランのセグメントを尊重しつつ、パネル構成は最適化可。',
  ].join('\n')

  const userPrompt = configPrompts.userPromptTemplate
    .replace('{{episodeNumber}}', episodeData.episodeNumber.toString())
    .replace('{{layoutInputJson}}', `${JSON.stringify(layoutInput, null, 2)}\n${prompt}`)
    .concat('\n指定ページ計画:\n')
    .concat(JSON.stringify(promptPlan, null, 2))

  // Reuse the same schema and mapper in generateLayout by calling the protected flow
  // For simplicity we duplicate minimal logic here
  const layoutPanelCountOutputSchema2 = layoutPanelCountOutputSchema

  const llmResponseObject = await agent.generateObject(
    [{ role: 'user', content: userPrompt }],
    layoutPanelCountOutputSchema2,
    {
      maxRetries: 0,
      jobId: options?.jobId,
      stepName: 'layout-plan',
      episodeNumber: episodeData.episodeNumber,
    },
  )

  const pages: { page_number: number; panels: Panel[] }[] = []
  for (const pageData of llmResponseObject.pages) {
    const panelCount = pageData.panelCount
    const template = selectLayoutTemplateByCountRandom(panelCount)
    const page = new Page(pageData.pageNumber)
    const planned = plan.plannedPages.find((p) => p.pageNumber === pageData.pageNumber)
    const segs = planned?.segments ?? []
    for (let i = 0; i < panelCount; i++) {
      const idx = segs.length > 0 ? Math.min(i, segs.length - 1) : 0
      const chunkIndex = segs[idx]?.source.chunkIndex ?? 0
      page.addPanel(
        {
          content: '',
          dialogues: undefined,
          sourceChunkIndex: chunkIndex,
          importance: 5,
          suggestedSize: 'medium',
        },
        template,
      )
    }
    page.validateLayout()
    pages.push({
      page_number: page.pageNumber,
      panels: page.getPanels().map((p) => p.toJSON()),
    })
  }

  return {
    title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeData.episodeNumber,
    episodeTitle: episodeData.episodeTitle,
    pages,
  }
}
