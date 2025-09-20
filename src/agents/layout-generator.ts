import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getLayoutGenerationConfig } from '@/config'
import { Page } from '@/domain/models/page'
import type { PanelInit } from '@/domain/models/panel'
import type { PageBatchPlan } from '@/types/page-splitting'
import type {
  ChunkAnalysisResult,
  ChunkData,
  EpisodeData,
  LayoutGenerationConfig,
  LayoutTemplate,
  MangaLayout,
  Panel,
} from '@/types/panel-layout'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'
import type { PanelImportanceLevel } from '@/utils/panel-importance'
import { mapImportanceToPanelSize, normalizeImportanceDistribution } from '@/utils/panel-importance'

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
      panelCount: z.number().int(),
    }),
  ),
})

export class LayoutGeneratorAgent {
  private generator = getLlmStructuredGenerator()

  async generateLayout(
    episodeData: EpisodeData,
    _config: LayoutGenerationConfig,
    _options?: { jobId?: string },
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

    const cfg = getLayoutGenerationConfig()
    const llmResponseObject = await this.generator.generateObjectWithFallback({
      name: 'layout-generator',
      systemPrompt: cfg.systemPrompt,
      userPrompt: prompt,
      schema: layoutPanelCountOutputSchema,
      schemaName: 'LayoutPanelCount',
      telemetry: {
        jobId: _options?.jobId,
        episodeNumber: episodeData.episodeNumber,
        stepName: 'layout',
      },
    })

    const pageCandidates: PageCandidate[] = []

    for (const pageData of llmResponseObject.pages) {
      const panelCount = Math.max(1, pageData.panelCount)
      const template = selectLayoutTemplateByCountRandom(panelCount)
      const slots: PanelSlotCandidate[] = []

      for (let i = 0; i < panelCount; i++) {
        const chunk = pickChunkForIndex(episodeData, i)
        slots.push({ chunk })
      }

      pageCandidates.push({
        pageNumber: pageData.pageNumber,
        template,
        slots,
      })
    }

    const pages = assemblePagesFromCandidates(pageCandidates, _config)

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
  const fallbackConfig: LayoutGenerationConfig = {
    panelsPerPage: { min: 1, max: 8, average: 3.5 },
    dialogueDensity: 0.6,
    visualComplexity: 0.7,
    highlightPanelSizeMultiplier: 2.0,
    readingDirection: 'right-to-left',
  }

  const pageCandidates: PageCandidate[] = []

  for (const pageData of llmOutput.pages) {
    const planPage = _plan.plannedPages.find((p) => p.pageNumber === pageData.pageNumber)
    const panelCount = Math.max(1, pageData.panelCount)
    const template = selectLayoutTemplateByCountRandom(panelCount)
    const slots: PanelSlotCandidate[] = []

    for (let i = 0; i < panelCount; i++) {
      const seg = planPage?.segments?.[i]
      const chunk = seg
        ? pickChunkByIndex(episodeData, seg.source.chunkIndex)
        : pickChunkForIndex(episodeData, i)

      slots.push({
        chunk,
        segmentStart: seg?.source.startOffset,
        segmentEnd: seg?.source.endOffset,
      })
    }

    pageCandidates.push({ pageNumber: pageData.pageNumber, template, slots })
  }

  const pages = assemblePagesFromCandidates(pageCandidates, fallbackConfig)

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
  await createAgentAndOptions(config, options.jobId)

  const userPrompt = buildUserPrompt(episodeData, plan, config)

  // Reuse the same schema and mapper in generateLayout by calling the protected flow
  // For simplicity we duplicate minimal logic here

  const cfg = getLayoutGenerationConfig()
  const result = await getLlmStructuredGenerator().generateObjectWithFallback({
    name: 'layout-generator',
    systemPrompt: cfg.systemPrompt,
    userPrompt: userPrompt,
    schema: layoutPanelCountOutputSchema,
    schemaName: 'LayoutPanelCount',
  })

  const layout = mapLayoutPanelCountToLayout(result, episodeData, plan)
  return layout
}

// ===== Helpers: Build content/dialogues from analysis without losing text =====

type PanelDialogueInit = NonNullable<PanelInit['dialogues']>[number]

interface PanelSlotCandidate {
  readonly chunk: ChunkData
  readonly segmentStart?: number
  readonly segmentEnd?: number
}

interface PageCandidate {
  readonly pageNumber: number
  readonly template: LayoutTemplate
  readonly slots: PanelSlotCandidate[]
}

interface PreparedPanelData {
  readonly content: string
  readonly dialogues: PanelDialogueInit[]
  readonly rawImportance: number
  readonly dialogueCharCount: number
  readonly narrationCharCount: number
  readonly contentLength: number
}

interface PreparedSlot {
  readonly pageNumber: number
  readonly template: LayoutTemplate
  readonly slotIndex: number
  readonly prepared: PreparedPanelData
  readonly sourceChunkIndex: number
  readonly globalIndex: number
}

function pickChunkForIndex(episodeData: EpisodeData, i: number) {
  const arr = episodeData.chunks
  if (arr.length === 0) {
    return {
      chunkIndex: 0,
      text: '',
      analysis: {
        chunkIndex: 0,
        characters: [],
        scenes: [],
        dialogues: [],
        highlights: [],
        situations: [],
        summary: episodeData.episodeSummary || '',
      } as ChunkAnalysisResult,
      isPartial: false,
      startOffset: 0,
      endOffset: 0,
    }
  }
  return arr[i % arr.length]
}

function pickChunkByIndex(episodeData: EpisodeData, chunkIndex: number) {
  const found = episodeData.chunks.find((c) => c.chunkIndex === chunkIndex)
  return found ?? pickChunkForIndex(episodeData, 0)
}

function assemblePagesFromCandidates(
  candidates: PageCandidate[],
  config: LayoutGenerationConfig,
): { page_number: number; panels: Panel[] }[] {
  const preparedSlots: PreparedSlot[] = []
  const slotsByPage = new Map<number, PreparedSlot[]>()
  let globalIndex = 0

  for (const candidate of candidates) {
    candidate.slots.forEach((slot, slotIndex) => {
      const prepared = preparePanelFromAnalysis(
        slot.chunk.analysis,
        config,
        slot.segmentStart,
        slot.segmentEnd,
        slot.chunk.text,
      )

      const preparedSlot: PreparedSlot = {
        pageNumber: candidate.pageNumber,
        template: candidate.template,
        slotIndex,
        prepared,
        sourceChunkIndex: slot.chunk.chunkIndex,
        globalIndex,
      }

      globalIndex += 1
      preparedSlots.push(preparedSlot)

      const existing = slotsByPage.get(candidate.pageNumber)
      if (existing) existing.push(preparedSlot)
      else slotsByPage.set(candidate.pageNumber, [preparedSlot])
    })
  }

  const normalized = normalizeImportanceDistribution(
    preparedSlots.map((slot) => ({
      index: slot.globalIndex,
      rawImportance: slot.prepared.rawImportance,
      dialogueCharCount: slot.prepared.dialogueCharCount,
      narrationCharCount: slot.prepared.narrationCharCount,
      contentLength: slot.prepared.contentLength,
    })),
  )

  const assignmentMap = new Map<number, PanelImportanceLevel>()
  for (const assignment of normalized) {
    assignmentMap.set(assignment.index, assignment.importance)
  }

  const pages: { page_number: number; panels: Panel[] }[] = []

  for (const candidate of candidates) {
    const page = new Page(candidate.pageNumber)
    const slots = [...(slotsByPage.get(candidate.pageNumber) ?? [])].sort(
      (a, b) => a.slotIndex - b.slotIndex,
    )

    for (const slot of slots) {
      const finalImportance = assignmentMap.get(slot.globalIndex) ?? 1
      const suggestedSize = mapImportanceToPanelSize(finalImportance)
      page.addPanel(
        {
          content: slot.prepared.content,
          dialogues: slot.prepared.dialogues,
          sourceChunkIndex: slot.sourceChunkIndex,
          importance: finalImportance,
          suggestedSize,
        },
        candidate.template,
      )
    }

    page.validateLayout()
    pages.push({ page_number: page.pageNumber, panels: page.getPanels().map((p) => p.toJSON()) })
  }

  return pages
}

function preparePanelFromAnalysis(
  analysis: ChunkAnalysisResult,
  config: LayoutGenerationConfig,
  segmentStart?: number,
  segmentEnd?: number,
  chunkText?: string,
): PreparedPanelData {
  const parts: string[] = []
  const hasSegment =
    typeof segmentStart === 'number' &&
    segmentStart >= 0 &&
    typeof segmentEnd === 'number' &&
    segmentEnd >= segmentStart
  const safeText = typeof chunkText === 'string' ? chunkText : undefined
  const segmentText =
    hasSegment && safeText && typeof segmentStart === 'number' && typeof segmentEnd === 'number'
      ? safeText.slice(segmentStart, segmentEnd)
      : undefined
  const firstScene = analysis.scenes?.[0]
  if (firstScene?.location) parts.push(`場所: ${firstScene.location}`)
  if (firstScene?.time) parts.push(`時間: ${firstScene.time}`)
  if (analysis.situations?.length) {
    const sit =
      hasSegment && segmentText
        ? analysis.situations.find((s) =>
            s.description ? segmentText.includes(s.description) : false,
          )
        : analysis.situations[0]
    if (sit) parts.push(sit.description)
  }
  if (analysis.highlights?.length) {
    const hi =
      hasSegment && segmentText
        ? analysis.highlights.find((h) => (h.text ? segmentText.includes(h.text) : false)) ||
          analysis.highlights[0]
        : analysis.highlights[0]
    if (hi) {
      const tag =
        hi.type === 'action_sequence' ? 'アクション' : hi.type === 'emotional_peak' ? '感情' : '注目'
      parts.push(`【${tag}】${hi.description}`)
    }
  }
  if (parts.length === 0) {
    if (hasSegment && segmentText && segmentText.trim().length > 0) {
      parts.push(ellipsis(segmentText.trim(), 120))
    } else if (analysis.summary) {
      parts.push(analysis.summary)
    }
  }
  const content = parts.join('\n')

  const maxDialogs = Math.max(1, Math.round((config.dialogueDensity || 0.6) * 3))
  let dialogs = analysis.dialogues ?? []
  if (hasSegment && safeText) {
    const filtered: typeof dialogs = []
    for (const d of dialogs) {
      const text = d.text?.trim()
      if (!text) continue
      const idx = safeText.indexOf(text)
      if (idx >= 0 && idx >= (segmentStart as number) && idx < (segmentEnd as number)) {
        filtered.push(d)
      }
    }
    dialogs = filtered
  }

  const selectedDialogs = dialogs.slice(0, maxDialogs)

  let dialogueCharCount = 0
  let narrationCharCount = 0
  const dialogues: PanelDialogueInit[] = selectedDialogs.map((d) => {
    const resolvedText = d.text ?? ''
    const normalizedLength = resolvedText.trim().length
    if (normalizedLength > 0) {
      if (d.type === 'narration') narrationCharCount += normalizedLength
      else dialogueCharCount += normalizedLength
    }
    return {
      speaker: d.speaker,
      text: resolvedText,
      ...(d.type ? { type: d.type } : {}),
    }
  })

  const highlightImportance = analysis.highlights?.length
    ? Math.max(...analysis.highlights.map((h) => h.importance || 5))
    : 5
  let rawImportance = Math.max(5, highlightImportance)
  if ((analysis.dialogues?.length ?? 0) > 5) {
    rawImportance = Math.max(rawImportance, 7)
  }
  rawImportance = Math.max(1, Math.min(rawImportance, 10))

  const contentLength = content.replace(/\s+/g, '').length

  return {
    content,
    dialogues,
    rawImportance,
    dialogueCharCount,
    narrationCharCount,
    contentLength,
  }
}

function ellipsis(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}
