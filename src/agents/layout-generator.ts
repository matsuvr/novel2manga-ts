import { z } from 'zod'
import { BaseAgent } from './base-agent'
import { getLayoutGenerationConfig } from '@/config'
import type {
  EpisodeData,
  LayoutGenerationConfig,
  MangaLayout,
  Page,
  Panel,
} from '@/types/panel-layout'
import { layoutRules, selectLayoutTemplate } from '@/utils/layout-templates'

// LLMからの出力スキーマ
const layoutGenerationOutputSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      panels: z.array(
        z.object({
          content: z.string(),
          dialogues: z
            .array(
              z.object({
                speaker: z.string(),
                text: z.string(),
              }),
            )
            .optional(),
          sourceChunkIndex: z.number(),
          importance: z.number().min(1).max(10),
          suggestedSize: z.enum(['small', 'medium', 'large', 'extra-large']),
        }),
      ),
    }),
  ),
})

export class LayoutGeneratorAgent extends BaseAgent {
  constructor() {
    super(
      'layout-generator',
      () => {
        const config = getLayoutGenerationConfig()
        return config.systemPrompt
      },
      'layoutGeneration',
    )
  }

  async generateLayout(
    episodeData: EpisodeData,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: LayoutGenerationConfig,
  ): Promise<MangaLayout> {
    // エピソードデータをLLM用に簡略化
    const simplifiedChunks = episodeData.chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      summary: chunk.analysis.summary,
      hasHighlight: chunk.analysis.highlights.length > 0,
      highlightImportance: Math.max(...chunk.analysis.highlights.map((h) => h.importance), 0),
      dialogueCount: chunk.analysis.dialogues.length,
      sceneDescription: chunk.analysis.scenes.map((s) => s.setting).join(', '),
      characters: chunk.analysis.characters.map((c) => c.name),
    }))

    // LLMでパネル内容を生成
    const layoutInput = {
      episodeData: {
        episodeNumber: episodeData.episodeNumber,
        episodeTitle: episodeData.episodeTitle,
        chunks: simplifiedChunks,
      },
      targetPages: episodeData.estimatedPages,
      layoutConstraints: {
        avoidEqualGrid: true,
        preferVariedSizes: true,
        ensureReadingFlow: true,
      },
    }

    const config = getLayoutGenerationConfig()
    const prompt = config.userPromptTemplate
      .replace('{{episodeNumber}}', episodeData.episodeNumber.toString())
      .replace('{{layoutInputJson}}', JSON.stringify(layoutInput, null, 2))

    const llmResponse = await this.generate([{ role: 'user', content: prompt }], {
      output: layoutGenerationOutputSchema,
    })

    if (!llmResponse.object) {
      throw new Error('Failed to generate layout - LLM returned no object')
    }

    // LLMの出力を実際のレイアウトに変換
    const pages: Page[] = []

    for (const pageData of llmResponse.object.pages) {
      const panelCount = pageData.panels.length
      type PanelType = { importance: number; dialogues?: { speaker: string; text: string }[] }
      const hasHighlight = pageData.panels.some((p: PanelType) => p.importance >= 7)
      const isClimax = pageData.panels.some((p: PanelType) => p.importance >= 9)
      const hasDialogue = pageData.panels.some(
        (p: PanelType) => p.dialogues && p.dialogues.length > 0,
      )

      // テンプレートを選択
      const template = selectLayoutTemplate(panelCount, hasHighlight, isClimax, hasDialogue)

      // パネルを生成
      type PanelData = {
        content: string
        dialogues?: { speaker: string; text: string }[]
        sourceChunkIndex: number
        importance: number
        suggestedSize: 'small' | 'medium' | 'large' | 'extra-large'
      }
      const panels: Panel[] = pageData.panels.map((panelData: PanelData, index: number) => {
        const templatePanel = template.panels[index] || template.panels[0]

        // 重要度に応じてサイズを調整
        let sizeMultiplier = 1.0
        if (panelData.suggestedSize === 'extra-large') sizeMultiplier = 1.5
        else if (panelData.suggestedSize === 'large') sizeMultiplier = 1.2
        else if (panelData.suggestedSize === 'small') sizeMultiplier = 0.8

        // サイズ調整（ページからはみ出さないように）
        const adjustedSize = {
          width: Math.min(templatePanel.size.width * sizeMultiplier, 1.0),
          height: Math.min(templatePanel.size.height * sizeMultiplier, 1.0),
        }

        return {
          id: index + 1,
          position: templatePanel.position,
          size: adjustedSize,
          content: panelData.content,
          dialogues: panelData.dialogues,
          sourceChunkIndex: panelData.sourceChunkIndex,
          importance: panelData.importance,
        }
      })

      // レイアウトルールをチェック
      if (layoutRules.forbidden.isEqualGrid(panels)) {
        console.warn(`Page ${pageData.pageNumber} has equal grid layout, adjusting...`)
        // サイズを微調整して均等分割を避ける
        panels.forEach((panel, i) => {
          const adjustment = 0.05 + i * 0.02
          panel.size.width += i % 2 === 0 ? adjustment : -adjustment
          panel.size.height += i % 2 === 1 ? adjustment : -adjustment
        })
      }

      pages.push({
        page_number: pageData.pageNumber,
        panels,
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
  return await agent.generateLayout(episodeData, fullConfig)
}

// エイリアス（重複排除）
export const generateLayoutWithAgent = generateMangaLayout
