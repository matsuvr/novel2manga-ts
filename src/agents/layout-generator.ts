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

// Helper function to create agent and options
async function createAgentAndOptions(_config: LayoutGenerationConfig, jobId: string) {
  const agent = new LayoutGeneratorAgent()
  return { agent, jobId }
}

// Helper function to build user prompt
function buildUserPrompt(
  episodeData: EpisodeData,
  plan: PageBatchPlan,
  config: LayoutGenerationConfig,
): string {
  return `エピソード${episodeData.episodeNumber}のレイアウトを生成してください。
計画: ${JSON.stringify(plan, null, 2)}
設定: ${JSON.stringify(config, null, 2)}
各ページのコマ数のみを決定してください。`
}

// Helper function to map LLM output to layout
function mapLayoutPanelCountToLayout(
  llmOutput: z.infer<typeof layoutPanelCountOutputSchema>,
  episodeData: EpisodeData,
  _plan: PageBatchPlan,
): MangaLayout {
  const pages: { page_number: number; panels: Panel[] }[] = []

  for (const pageData of llmOutput.pages) {
    const panelCount = pageData.panelCount
    const template = selectLayoutTemplateByCountRandom(panelCount)

    const page = new Page(pageData.pageNumber)
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

// Incremental: generate only specified pages guided by a batch plan
export async function generateMangaLayoutForPlan(
  episodeData: EpisodeData,
  plan: PageBatchPlan,
  config: LayoutGenerationConfig,
  options: { jobId: string },
): Promise<MangaLayout> {
  const { agent } = await createAgentAndOptions(config, options.jobId)

  const userPrompt = buildUserPrompt(episodeData, plan, config)

  // Reuse the same schema and mapper in generateLayout by calling the protected flow
  // For simplicity we duplicate minimal logic here

  const llmResponseObject = await agent.generateObject(
    [{ role: 'user', content: userPrompt }],
    layoutPanelCountOutputSchema,
    {
      maxRetries: 0,
      stepName: 'layout',
      episodeNumber: episodeData.episodeNumber,
    },
  )

  const layout = mapLayoutPanelCountToLayout(llmResponseObject, episodeData, plan)
  return layout
}
