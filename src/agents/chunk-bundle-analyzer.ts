import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getChunkBundleAnalysisConfig } from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { ChunkAnalysisResult } from '@/types/chunk'

// LLM structured generator (with LLM-only fallback)
const generator = getLlmStructuredGenerator()

// 統合分析の結果スキーマ
export const bundleAnalysisSchema = z.object({
  summary: z.string().describe('物語全体の簡潔な要約（200-500文字）'),

  mainCharacters: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().describe('物語における役割'),
        description: z.string().describe('人物の特徴や性格'),
      }),
    )
    .describe('主要な登場人物（最大10名）'),

  highlights: z
    .array(
      z.object({
        text: z.string().describe('重要な場面の内容'),
        importance: z.number().min(1).max(10).describe('重要度（1-10）'),
        context: z.string().nullable().optional().describe('場面の文脈や意味'),
      }),
    )
    .describe('物語の見所となる重要な場面'),

  keyDialogues: z
    .array(
      z.object({
        speaker: z.string(),
        text: z.string(),
        significance: z.string().describe('この会話の重要性'),
      }),
    )
    .describe('物語の鍵となる重要な会話（最大10個）'),

  narrativeFlow: z
    .object({
      opening: z.string().describe('物語の導入部分の要約'),
      development: z.string().describe('物語の展開部分の要約'),
      currentState: z.string().describe('現在の物語の状態'),
      tension: z.coerce
        .number()
        .transform((value) => {
          const n = Number.isNaN(value) ? 0 : value
          return Math.max(0, Math.min(10, n))
        })
        .describe('現在の緊張度（0-10）'),
    })
    .describe('物語の流れと現在の状態'),
})

export type BundleAnalysisResult = z.infer<typeof bundleAnalysisSchema>

interface ChunkWithAnalysis {
  text: string
  analysis: ChunkAnalysisResult
}

// DEPRECATED: This function is no longer used in the current flow
// The correct flow is: textAnalysis → narrativeArcAnalysis → scriptConversion → pageBreakEstimation
export async function analyzeChunkBundle(
  chunksWithAnalyses: ChunkWithAnalysis[],
): Promise<BundleAnalysisResult> {
  const logger = getLogger().withContext({
    agent: 'chunk-bundle-analyzer',
    operation: 'analyzeChunkBundle',
  })

  logger.info('Starting bundle analysis', {
    chunkCount: chunksWithAnalyses.length,
    totalTextLength: chunksWithAnalyses.reduce((s, c) => s + c.text.length, 0),
  })

  try {
    // LLMモック: 解析をスキップして定型の集約を返す
    if (String(process.env.N2M_MOCK_LLM) === '1') {
      const textLen = chunksWithAnalyses.reduce((s, c) => s + c.text.length, 0)
      const sample = chunksWithAnalyses[0]
      return {
        summary: `モック要約: ${chunksWithAnalyses.length}チャンク、合計${textLen}文字`,
        mainCharacters: [
          { name: '主人公', role: '主人公', description: '中心人物（モック）' },
          { name: '相棒', role: '相棒', description: 'サポート役（モック）' },
        ],
        highlights: [
          {
            text: sample?.text.slice(0, 40) || 'テキストなし',
            importance: 7,
            context: '物語の転換点（モック）',
          },
        ],
        keyDialogues: [
          {
            speaker: '主人公',
            text: 'ここが山場だ。',
            significance: '決意を示す（モック）',
          },
        ],
        narrativeFlow: {
          opening: '導入（モック）',
          development: '展開（モック）',
          currentState: '現在の状況（モック）',
          tension: 6,
        },
      }
    }

    // 各チャンクの分析結果を構造化して整理
    const charactersMap = new Map<string, { descriptions: string[]; appearances: number }>()
    const allScenes: string[] = []
    const allDialogues: Array<{
      speaker: string
      text: string
      emotion?: string
    }> = []
    const allHighlights: Array<{
      type: string
      description: string
      importance: number
      text?: string
    }> = []
    const allSituations: string[] = []

    // 各チャンクの分析結果を集約
    chunksWithAnalyses.forEach((chunk, _index) => {
      const analysis = chunk.analysis

      // キャラクター情報の集約
      analysis.characters.forEach((char) => {
        if (!charactersMap.has(char.name)) {
          charactersMap.set(char.name, { descriptions: [], appearances: 0 })
        }
        const charData = charactersMap.get(char.name)
        if (!charData) return // 見つからない場合はスキップ
        if (char.description != null) {
          charData.descriptions.push(char.description)
        }
        charData.appearances++
      })

      // シーン情報の集約
      analysis.scenes.forEach((scene) => {
        const sceneDesc = `${scene.location}${scene.time ? ` (${scene.time})` : ''}: ${scene.description}`
        allScenes.push(sceneDesc)
      })

      // 対話の集約
      analysis.dialogues.forEach((dialogue) => {
        allDialogues.push({
          speaker: dialogue.speakerId,
          text: dialogue.text,
          emotion: dialogue.emotion,
        })
      })

      // ハイライトの集約（テキストの一部を含める）
      analysis.highlights.forEach((highlight) => {
        const highlightText = chunk.text.substring(
          highlight.startIndex,
          Math.min(highlight.endIndex, highlight.startIndex + 100),
        )
        allHighlights.push({
          type: highlight.type,
          description: highlight.description,
          importance: highlight.importance,
          text: highlightText,
        })
      })

      // 状況説明の集約
      analysis.situations.forEach((situation) => {
        allSituations.push(situation.description)
      })
    })

    // 設定からプロンプトテンプレートを取得
    const config = getChunkBundleAnalysisConfig()
    let userPrompt: string = config.userPromptTemplate || ''

    // プロンプトのプレースホルダーを置換
    const characterList = Array.from(charactersMap.entries())
      .map(
        ([name, data]) =>
          `- ${name} (登場回数: ${data.appearances}回)\n  ${data.descriptions.join('\n  ')}`,
      )
      .join('\n')

    const sceneList = allScenes.map((scene) => `- ${scene}`).join('\n')

    const dialogueList = allDialogues
      .slice(0, 20)
      .map((d) => `- ${d.speaker}: 「${d.text}」${d.emotion ? ` (${d.emotion})` : ''}`)
      .join('\n')

    const highlightList = allHighlights
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 15)
      .map((h) => `- [${h.type}] ${h.description} (重要度: ${h.importance})\n  "${h.text}..."`)
      .join('\n')

    const situationList = allSituations
      .slice(0, 10)
      .map((s) => `- ${s}`)
      .join('\n')

    // テンプレートの置換
    userPrompt = userPrompt
      .replace('{{characterList}}', characterList || 'なし')
      .replace('{{sceneList}}', sceneList || 'なし')
      .replace('{{dialogueList}}', dialogueList || 'なし')
      .replace('{{highlightList}}', highlightList || 'なし')
      .replace('{{situationList}}', situationList || 'なし')

    try {
      logger.info('Sending request to LLM for bundle analysis', {
        userPromptLength: userPrompt.length,
        chunkCount: chunksWithAnalyses.length,
      })

      const cfg = getChunkBundleAnalysisConfig()
      const result = await generator.generateObjectWithFallback({
        name: 'Chunk Bundle Analyzer',
        systemPrompt: cfg.systemPrompt,
        userPrompt: userPrompt,
        schema: bundleAnalysisSchema,
        schemaName: 'BundleAnalysis',
      })

      logger.info('Bundle analysis completed successfully', {
        summaryLength: result.summary.length,
        charactersFound: result.mainCharacters.length,
        highlightsFound: result.highlights.length,
        keyDialoguesFound: result.keyDialogues.length,
      })

      return result
    } catch (error) {
      logger.error('Bundle analysis LLM request failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'llm_request',
      })
      throw error
    }
  } catch (error) {
    logger.error('Fatal error in bundle analysis', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      chunkCount: chunksWithAnalyses.length,
      operation: 'bundle_analysis',
    })
    throw error
  }
}
