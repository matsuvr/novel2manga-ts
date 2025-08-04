import { Agent } from '@mastra/core'
import { z } from 'zod'
import type { ChunkAnalysisResult } from '@/types/chunk'
import { getTextAnalysisLLM } from '@/utils/llm-factory'

const chunkBundleAnalyzer = new Agent({
  name: 'Chunk Bundle Analyzer',
  instructions: `あなたは優秀な文学分析の専門家です。複数のチャンク分析結果を統合し、物語全体の要素を抽出してください。

以下の点に注意してください：
- 各チャンクの分析結果を総合的に評価してください
- 物語の連続性と流れを重視してください
- 重複する情報は統合し、最も重要な要素を選別してください
- チャンク番号への言及は避け、物語の内容に焦点を当ててください`,
  model: async ({ runtimeContext: _runtimeContext }) => {
    // フォールバック機能付きでLLMを取得
    const llm = await getTextAnalysisLLM()
    console.log(`[chunkBundleAnalyzer] Using provider: ${llm.providerName}`)
    console.log(`[chunkBundleAnalyzer] Using model: ${llm.model}`)
    
    // モデルを返す
    return llm.provider(llm.model) as any // Mastraの型互換性のための一時的な回避策
  },
})

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
        type: z.enum([
          'climax',
          'turning_point',
          'emotional_peak',
          'action_sequence',
          'revelation',
        ]),
        importance: z.number().min(1).max(10).describe('重要度（1-10）'),
        context: z.string().optional().describe('場面の文脈や意味'),
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
      tension: z.number().min(1).max(10).describe('現在の緊張度（1-10）'),
    })
    .describe('物語の流れと現在の状態'),
})

export type BundleAnalysisResult = z.infer<typeof bundleAnalysisSchema>

interface ChunkWithAnalysis {
  text: string
  analysis: ChunkAnalysisResult
}

export async function analyzeChunkBundle(
  chunksWithAnalyses: ChunkWithAnalysis[],
): Promise<BundleAnalysisResult> {
  console.log('[analyzeChunkBundle] Starting bundle analysis with chunks:', chunksWithAnalyses.length)
  
  try {

  // 各チャンクの分析結果を構造化して整理
  const charactersMap = new Map<string, { descriptions: string[]; appearances: number }>()
  const allScenes: string[] = []
  const allDialogues: Array<{ speaker: string; text: string; emotion?: string }> = []
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
      charData.descriptions.push(char.description)
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

  // プロンプト作成
  const userPrompt = `以下の分析結果を統合し、物語全体の要素を抽出してください。

【登場人物情報】
${Array.from(charactersMap.entries())
  .map(
    ([name, data]) =>
      `- ${name} (登場回数: ${data.appearances}回)\n  ${data.descriptions.join('\n  ')}`,
  )
  .join('\n')}

【場面情報】
${allScenes.map((scene) => `- ${scene}`).join('\n')}

【重要な対話】
${allDialogues
  .slice(0, 20)
  .map((d) => `- ${d.speaker}: 「${d.text}」${d.emotion ? ` (${d.emotion})` : ''}`)
  .join('\n')}

【ハイライトシーン】
${allHighlights
  .sort((a, b) => b.importance - a.importance)
  .slice(0, 15)
  .map((h) => `- [${h.type}] ${h.description} (重要度: ${h.importance})\n  "${h.text}..."`)
  .join('\n')}

【状況説明】
${allSituations
  .slice(0, 10)
  .map((s) => `- ${s}`)
  .join('\n')}

【統合指示】
1. 上記の情報を基に、物語全体の要約を作成してください
2. 主要な登場人物を選別し、その役割と特徴をまとめてください（最大10名）
3. 最も重要な見所シーンを選別してください（重要度は1-10で再評価）
4. 物語の鍵となる会話を選別してください（最大10個）
5. 物語の流れ（導入・展開・現在の状態）を分析してください

注意：個別のチャンク番号や分析の痕跡を残さず、一つの連続した物語として扱ってください。`

  try {
    console.log('Sending to LLM for bundle analysis...')

    const result = await chunkBundleAnalyzer.generate([{ role: 'user', content: userPrompt }], {
      output: bundleAnalysisSchema,
    })

    if (!result.object) {
      throw new Error('Failed to generate bundle analysis')
    }

    console.log('Bundle analysis successful')
    console.log('Summary length:', result.object.summary.length)
    console.log('Characters found:', result.object.mainCharacters.length)
    console.log('Highlights found:', result.object.highlights.length)
    console.log('Key dialogues found:', result.object.keyDialogues.length)

    return result.object
  } catch (error) {
    console.error('[analyzeChunkBundle] Bundle analysis LLM error:', error)
    throw error
  }
  
  } catch (error) {
    console.error('[analyzeChunkBundle] Fatal error in bundle analysis:', error)
    throw error
  }
}
