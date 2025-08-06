import { Agent } from '@mastra/core'
import { z } from 'zod'
import { analyzeChunkBundle, type BundleAnalysisResult } from '@/agents/chunk-bundle-analyzer'
import { getEpisodeConfig, getNarrativeAnalysisConfig } from '@/config'
import type { ChunkAnalysisResult } from '@/types/chunk'
import type { EpisodeBoundary } from '@/types/episode'
import { getNarrativeAnalysisLLM } from '@/utils/llm-factory'
const narrativeArcAnalyzer = new Agent({
  name: 'Narrative Arc Analyzer',
  instructions: () => {
    const config = getNarrativeAnalysisConfig()
    return config.systemPrompt
  },
  model: async () => {
    // フォールバック機能付きでLLMを取得
    const llm = await getNarrativeAnalysisLLM()
    console.log(`[narrativeArcAnalyzer] Using provider: ${llm.providerName}`)
    console.log(`[narrativeArcAnalyzer] Using model: ${llm.model}`)

    // モデルを返す
    return llm.provider(llm.model)
  },
})

export async function analyzeNarrativeArc(input: {
  jobId: string
  chunks: {
    chunkIndex: number
    text: string
    analysis: {
      summary: string
      characters: { name: string; role: string }[]
      dialogues: ChunkAnalysisResult['dialogues']
      scenes: ChunkAnalysisResult['scenes']
      highlights: {
        text: string
        importance: number
        description: string
        startIndex: number
        endIndex: number
      }[]
    }
  }[]
  targetCharsPerEpisode: number
  minCharsPerEpisode: number
  maxCharsPerEpisode: number
  startingEpisodeNumber?: number
  isMiddleOfNovel: boolean
  previousEpisodeEndText?: string
}): Promise<EpisodeBoundary[]> {
  console.log('analyzeNarrativeArc called with:', {
    chunks: input.chunks.length,
    targetChars: input.targetCharsPerEpisode,
    startingEpisodeNumber: input.startingEpisodeNumber || 1,
    isMiddleOfNovel: input.isMiddleOfNovel || false,
  })

  const episodeConfig = getEpisodeConfig()
  const targetPages = Math.round(input.targetCharsPerEpisode / episodeConfig.charsPerPage)
  const minPages = Math.round(input.minCharsPerEpisode / episodeConfig.charsPerPage)
  const maxPages = Math.round(input.maxCharsPerEpisode / episodeConfig.charsPerPage)

  // チャンクを完全に繋げて、一つの連続したテキストとして扱う
  // 前回のエピソードの終わり部分があれば、それを先頭に追加
  const chunksText = input.chunks.map((chunk) => chunk.text).join('')
  const fullText = input.previousEpisodeEndText
    ? input.previousEpisodeEndText + chunksText
    : chunksText

  // まず、チャンクの束を統合分析
  console.log('Performing bundle analysis first...')
  console.log(`Loading analysis results for job ${input.jobId}...`)

  const { StorageFactory } = await import('@/utils/storage')

  async function getChunkAnalysis(jobId: string, chunkIndex: number) {
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const analysisPath = `analyses/${jobId}/chunk_${chunkIndex}.json`
    const existingAnalysis = await analysisStorage.get(analysisPath)

    if (existingAnalysis) {
      const analysisData = JSON.parse(existingAnalysis.text)
      return analysisData.analysis
    }

    return null
  }

  const chunksWithAnalyses = []
  for (const chunk of input.chunks) {
    console.log(`Loading analysis for chunk ${chunk.chunkIndex}...`)
    const analysisResult = await getChunkAnalysis(input.jobId, chunk.chunkIndex)

    if (!analysisResult) {
      const error = `Chunk analysis not found for job ${input.jobId}, chunk ${chunk.chunkIndex}`
      console.error(error)
      throw new Error(error)
    }

    chunksWithAnalyses.push({
      text: chunk.text,
      analysis: analysisResult,
    })
  }

  console.log(`Successfully loaded ${chunksWithAnalyses.length} chunk analyses`)

  let bundleAnalysis: BundleAnalysisResult
  try {
    bundleAnalysis = await analyzeChunkBundle(chunksWithAnalyses)
  } catch (error) {
    console.error('Bundle analysis failed:', error)
    throw new Error('Failed to perform bundle analysis before narrative arc analysis')
  }

  console.log('Bundle analysis completed, proceeding to narrative arc analysis...')

  // 統合分析結果を使用してプロンプトを作成
  const characterList = bundleAnalysis.mainCharacters
    .map((char) => `${char.name}（${char.role}）`)
    .join('、')

  const highlightsInfo = bundleAnalysis.highlights
    .filter((h) => h.importance >= 6)
    .map((h) => `- ${h.text} (重要度: ${h.importance})${h.context ? `\n  ${h.context}` : ''}`)
    .join('\n')

  const characterActions = bundleAnalysis.keyDialogues
    .map((d) => `${d.speaker}: 「${d.text}」\n  意味: ${d.significance}`)
    .join('\n\n')

  // プロンプトのカスタマイズ
  const narrativeConfig = getNarrativeAnalysisConfig()
  let customizedPrompt: string = narrativeConfig.userPromptTemplate

  // 長編小説の途中の場合、その旨を追加
  if (input.isMiddleOfNovel) {
    const contextInfo = `
【重要な注意】
- これは長編小説の一部です
- エピソード番号は${input.startingEpisodeNumber || 1}から始めてください
- テキストの冲頭は前のエピソードの続きから始まっています
- テキストの最後がエピソードの途中で終わっている可能性があります
`
    customizedPrompt = customizedPrompt.replace('【分析対象】', `【分析対象】${contextInfo}`)
  }

  const userPrompt = customizedPrompt
    .replace('{{totalChars}}', fullText.length.toString())
    .replace('{{targetPages}}', targetPages.toString())
    .replace('{{minPages}}', minPages.toString())
    .replace('{{maxPages}}', maxPages.toString())
    .replace('{{characterList}}', characterList || 'なし')
    .replace('{{overallSummary}}', bundleAnalysis.summary || 'なし')
    .replace('{{highlightsInfo}}', highlightsInfo || 'なし')
    .replace('{{characterActions}}', characterActions || 'なし')
    .replace('{{fullText}}', fullText)

  const responseSchema = z.object({
    boundaries: z.array(
      z.object({
        startPosition: z.number().describe('エピソード開始位置（全文テキストの先頭からの文字数）'),
        endPosition: z.number().describe('エピソード終了位置（全文テキストの先頭からの文字数）'),
        episodeNumber: z
          .number()
          .describe(`エピソード番号（${input.startingEpisodeNumber || 1}から開始）`),
        title: z.string().optional(),
        summary: z.string().optional(),
        estimatedPages: z.number(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
      }),
    ),
    overallAnalysis: z.string(),
    suggestions: z.array(z.string()).optional(),
  })

  try {
    console.log('Sending to LLM for analysis...')
    console.log('Text length:', fullText.length)
    console.log('Target pages:', targetPages)

    const result = await narrativeArcAnalyzer.generate([{ role: 'user', content: userPrompt }], {
      output: responseSchema,
    })

    if (!result.object) {
      const errorMsg = 'Failed to generate narrative analysis - LLM returned no object'
      console.error(errorMsg)
      console.error('Result:', result)
      throw new Error(errorMsg)
    }

    console.log('LLM analysis successful')
    console.log('Found boundaries:', result.object.boundaries.length)
    console.log('Overall analysis:', result.object.overallAnalysis)

    // バウンダリーが空の場合の警告
    if (result.object.boundaries.length === 0) {
      console.warn('WARNING: No episode boundaries found by LLM')
      console.warn('Suggestions:', result.object.suggestions)
      return []
    }

    // 文字位置からチャンク番号・位置を計算
    const previousTextLength = input.previousEpisodeEndText?.length || 0
    const boundaries = convertPositionsToBoundaries(
      result.object.boundaries,
      input.chunks,
      previousTextLength,
    )

    return boundaries
  } catch (error) {
    console.error('=== Narrative arc analysis FAILED ===')
    console.error('Error details:', error)
    console.error('Input chunks:', input.chunks.length)
    console.error('Total characters:', fullText.length)

    // エラーを再スロー（フォールバックなし）
    throw error
  }
}

// 文字位置からチャンク番号・文字位置を計算
function convertPositionsToBoundaries(
  rawBoundaries: Array<{
    startPosition: number
    endPosition: number
    episodeNumber: number
    title?: string
    summary?: string
    estimatedPages: number
    confidence: number
    reasoning: string
  }>,
  chunks: Array<{
    chunkIndex: number
    text: string
    analysis: {
      summary: string
      characters: { name: string; role: string }[]
      dialogues: ChunkAnalysisResult['dialogues']
      scenes: ChunkAnalysisResult['scenes']
      highlights: {
        text: string
        importance: number
        description: string
        startIndex: number
        endIndex: number
      }[]
    }
  }>,
  previousTextLength: number = 0,
): EpisodeBoundary[] {
  // 各チャンクの開始位置を計算
  // 前回のテキスト長を考慮
  const chunkPositions: Array<{ chunkIndex: number; startPos: number; endPos: number }> = []
  let currentPos = previousTextLength

  chunks.forEach((chunk) => {
    const chunkLength = chunk.text.length
    chunkPositions.push({
      chunkIndex: chunk.chunkIndex,
      startPos: currentPos,
      endPos: currentPos + chunkLength,
    })
    currentPos += chunkLength
  })

  // 位置からチャンク番号を找す関数
  const findChunkAndOffset = (position: number): { chunkIndex: number; charIndex: number } => {
    for (const chunkPos of chunkPositions) {
      if (position >= chunkPos.startPos && position <= chunkPos.endPos) {
        return {
          chunkIndex: chunkPos.chunkIndex,
          charIndex: position - chunkPos.startPos,
        }
      }
    }
    // 最後の位置の場合
    const lastChunk = chunkPositions[chunkPositions.length - 1]
    return {
      chunkIndex: lastChunk.chunkIndex,
      charIndex: lastChunk.endPos - lastChunk.startPos,
    }
  }

  return rawBoundaries.map((boundary) => {
    const start = findChunkAndOffset(boundary.startPosition)
    const end = findChunkAndOffset(boundary.endPosition)

    console.log(
      `Episode ${boundary.episodeNumber}: Position ${boundary.startPosition}-${boundary.endPosition} -> Chunk ${start.chunkIndex}:${start.charIndex} - ${end.chunkIndex}:${end.charIndex}`,
    )

    return {
      startChunk: start.chunkIndex,
      startCharIndex: start.charIndex,
      endChunk: end.chunkIndex,
      endCharIndex: end.charIndex,
      episodeNumber: boundary.episodeNumber,
      title: boundary.title,
      summary: boundary.summary,
      estimatedPages: boundary.estimatedPages,
      confidence: boundary.confidence,
    }
  })
}
