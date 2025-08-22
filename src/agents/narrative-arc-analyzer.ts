import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getNarrativeAnalysisConfig } from '@/config'
import type { IChunkRepository } from '@/domain/repositories/chunk-repository'
import type { ChunkAnalysisResult } from '@/types/chunk'
import type { EpisodeBoundary } from '@/types/episode'

const generator = getLlmStructuredGenerator()

export async function analyzeNarrativeArc(
  input: {
    jobId: string
    chunks: {
      chunkIndex: number
      text: string
      analysis: {
        summary: string
        characters: { name: string; role: string; description?: string }[]
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
  },
  chunkRepository: IChunkRepository,
): Promise<EpisodeBoundary[]> {
  console.log('analyzeNarrativeArc called with:', {
    chunks: input.chunks.length,
    targetChars: input.targetCharsPerEpisode,
    startingEpisodeNumber: input.startingEpisodeNumber || 1,
    isMiddleOfNovel: input.isMiddleOfNovel || false,
  })

  // Remove page-based calculations as we now rely on advanced LLM for intelligent page estimation

  // チャンクを完全に繋げて、一つの連続したテキストとして扱う
  // 前回のエピソードの終わり部分があれば、それを先頭に追加
  const chunksText = input.chunks.map((chunk) => chunk.text).join('')
  const fullText = input.previousEpisodeEndText
    ? input.previousEpisodeEndText + chunksText
    : chunksText

  // まず、チャンクの束を統合分析
  console.log('Performing bundle analysis first...')

  const chunkIndices = input.chunks.map((c) => c.chunkIndex)
  const analyzedChunks = await chunkRepository.getAnalyzedChunks(input.jobId, chunkIndices)
  const analysisMap = new Map(analyzedChunks.map((c) => [c.chunkIndex, c.analysis]))

  // 入力/DBのどちらの形でも受け取れるよう、解析結果を正規化してからバンドル解析へ渡す
  type InputPartialAnalysis = {
    summary: string
    characters: { name: string; role: string; description?: string }[]
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

  const isChunkAnalysisResult = (v: unknown): v is ChunkAnalysisResult => {
    if (typeof v !== 'object' || v === null) return false
    const obj = v as Record<string, unknown>
    return (
      typeof obj.chunkIndex === 'number' &&
      typeof obj.narrativeElements === 'object' &&
      obj.narrativeElements !== null
    )
  }

  const coerceRole = (role: string): 'protagonist' | 'antagonist' | 'supporting' | 'minor' => {
    switch (role) {
      case 'protagonist':
      case 'antagonist':
      case 'supporting':
      case 'minor':
        return role
      default:
        return 'supporting'
    }
  }

  const toFullAnalysis = (
    chunkIndex: number,
    text: string,
    src: InputPartialAnalysis | ChunkAnalysisResult,
  ): ChunkAnalysisResult => {
    if (isChunkAnalysisResult(src)) return src
    const partial = src as InputPartialAnalysis
    return {
      chunkIndex,
      characters: partial.characters.map((c) => ({
        name: c.name,
        role: coerceRole(c.role),
        description: c.description,
      })),
      scenes: partial.scenes.map((s) => ({
        location: s.location,
        time: s.time,
        timeOfDay: s.timeOfDay,
        atmosphere: s.atmosphere,
        description: s.description,
      })),
      dialogues: partial.dialogues,
      highlights: partial.highlights.map((h) => ({
        importance: h.importance ?? 5,
        description: h.description ?? '',
        endIndex: h.endIndex,
        startIndex: h.startIndex,
        type: 'plot',
        content: h.text || text.substring(h.startIndex, Math.min(h.endIndex, h.startIndex + 120)),
        intensity: 5,
        relevance: 5,
      })),
      situations: [],
      narrativeElements: {
        tension: 5,
        pacing: 'medium',
        emotionalTone: 'neutral',
        plotRelevance: 5,
      },
    }
  }

  const chunksWithAnalyses: Array<{
    text: string
    analysis: ChunkAnalysisResult
  }> = []
  for (const chunk of input.chunks) {
    const analysisCandidate = chunk.analysis || (analysisMap.get(chunk.chunkIndex) as unknown)

    if (!analysisCandidate) {
      const error = `Chunk analysis not found for job ${input.jobId}, chunk ${chunk.chunkIndex}`
      console.error(error)
      throw new Error(error)
    }

    const normalized = toFullAnalysis(chunk.chunkIndex, chunk.text, analysisCandidate)
    chunksWithAnalyses.push({ text: chunk.text, analysis: normalized })
  }

  console.log(`Successfully prepared ${chunksWithAnalyses.length} chunk analyses`)

  console.log('Proceeding directly to narrative arc analysis using chunk analyses...')

  // チャンクの分析結果から直接キャラクターや重要な場面を抽出
  const allCharacters = new Map<string, { role: string; descriptions: string[] }>()
  const allHighlights: Array<{ text: string; importance: number; description: string }> = []
  const allDialogues: Array<{ speaker: string; text: string }> = []

  // 各チャンクの分析結果を集約
  chunksWithAnalyses.forEach((chunk) => {
    // キャラクター情報の集約
    chunk.analysis.characters.forEach((char) => {
      if (!allCharacters.has(char.name)) {
        allCharacters.set(char.name, { role: char.role, descriptions: [] })
      }
      const charData = allCharacters.get(char.name)
      if (charData && char.description) {
        charData.descriptions.push(char.description)
      }
    })

    // ハイライトの集約
    chunk.analysis.highlights.forEach((highlight) => {
      allHighlights.push({
        text: highlight.content,
        importance: highlight.importance,
        description: highlight.description,
      })
    })

    // 対話の集約
    chunk.analysis.dialogues.forEach((dialogue) => {
      allDialogues.push({
        speaker: dialogue.speakerId,
        text: dialogue.text,
      })
    })
  })

  // プロンプト用にフォーマット
  const characterList = Array.from(allCharacters.entries())
    .map(([name, data]) => `${name}（${data.role}）`)
    .join('、')

  const highlightsInfo = allHighlights
    .filter((h) => h.importance >= 6)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10)
    .map((h) => `- ${h.text} (重要度: ${h.importance})\n  ${h.description}`)
    .join('\n')

  const characterActions = allDialogues
    .slice(0, 8)
    .map((d) => `${d.speaker}: 「${d.text}」`)
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
- テキストの冒頭は前のエピソードの続きから始まっています
- テキストの最後がエピソードの途中で終わっている可能性があります
`
    customizedPrompt = customizedPrompt.replace('【分析対象】', `【分析対象】${contextInfo}`)
  }

  const userPrompt = customizedPrompt
    .replace('{{totalChars}}', fullText.length.toString())
    .replace('{{characterList}}', characterList || 'なし')
    .replace('{{overallSummary}}', 'チャンク分析結果から抽出された情報')
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
        title: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
        characterList: z
          .array(z.string())
          .describe('入力されたキャラクター名のリストをまとめたもの'),
        sceneList: z.array(z.string()).describe('入力されたシーンのリストをまとめたもの'),
        dialogueList: z.array(z.string()).describe('入力されたセリフのリストをまとめたもの'),
        highlightList: z.array(z.string()).describe('入力したハイライトのリストをまとめたもの'),
        situationList: z.array(z.string()).describe('入力した状況のリストをまとめたもの'),
      }),
    ),
    overallAnalysis: z.string(),
    suggestions: z.array(z.string()).nullable().optional(),
  })

  try {
    console.log('Sending to LLM for analysis...')
    console.log('Text length:', fullText.length)

    const cfg = getNarrativeAnalysisConfig()
    const result = await generator.generateObjectWithFallback({
      name: 'Narrative Arc Analyzer',
      systemPrompt: cfg.systemPrompt,
      userPrompt: userPrompt,
      schema: responseSchema,
      schemaName: 'EpisodeBoundaries',
    })

    if (!result) {
      const errorMsg = 'Failed to generate narrative analysis - LLM returned no object'
      console.error(errorMsg)
      console.error('Result:', result)
      throw new Error(errorMsg)
    }

    console.log('LLM analysis successful')

    // Defensive parsing: handle cases where LLM response may have malformed or missing boundaries
    type RawBoundary = {
      startPosition: number
      endPosition: number
      episodeNumber: number
      title?: string | null
      summary?: string | null
      confidence: number
      reasoning: string
      characterList: string[]
      sceneList: string[]
      dialogueList: string[]
      highlightList: string[]
      situationList: string[]
    }
    const boundariesArr: RawBoundary[] = Array.isArray(
      (result as unknown as { boundaries?: unknown }).boundaries,
    )
      ? (result as unknown as { boundaries: RawBoundary[] }).boundaries
      : []
    console.log('Found boundaries:', boundariesArr.length)
    console.log('Overall analysis:', (result as { overallAnalysis?: unknown }).overallAnalysis)

    // バウンダリーが空の場合の警告
    if (boundariesArr.length === 0) {
      console.warn('WARNING: No episode boundaries found by LLM')
      console.warn('Suggestions:', (result as { suggestions?: unknown }).suggestions)
      return []
    }

    // 文字位置からチャンク番号・位置を計算
    const previousTextLength = input.previousEpisodeEndText?.length || 0
    // Convert nullable fields to undefined for type compatibility and ensure required fields are preserved
    const processedBoundaries: Array<{
      startPosition: number
      endPosition: number
      episodeNumber: number
      title?: string
      summary?: string
      confidence: number
      reasoning: string
      characterList: string[]
      sceneList: string[]
      dialogueList: string[]
      highlightList: string[]
      situationList: string[]
    }> = boundariesArr.map((boundary) => ({
      startPosition: boundary.startPosition,
      endPosition: boundary.endPosition,
      episodeNumber: boundary.episodeNumber,
      title: boundary.title ?? undefined,
      summary: boundary.summary ?? undefined,
      confidence: boundary.confidence,
      reasoning: boundary.reasoning,
      characterList: boundary.characterList || [],
      sceneList: boundary.sceneList || [],
      dialogueList: boundary.dialogueList || [],
      highlightList: boundary.highlightList || [],
      situationList: boundary.situationList || [],
    }))

    const boundaries = convertPositionsToBoundaries(
      processedBoundaries,
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
    confidence: number
    reasoning: string
    characterList: string[]
    sceneList: string[]
    dialogueList: string[]
    highlightList: string[]
    situationList: string[]
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
  const chunkPositions: Array<{
    chunkIndex: number
    startPos: number
    endPos: number
  }> = []
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
      confidence: boundary.confidence,
      reasoning: boundary.reasoning,
      characterList: boundary.characterList,
      sceneList: boundary.sceneList,
      dialogueList: boundary.dialogueList,
      highlightList: boundary.highlightList,
      situationList: boundary.situationList,
    }
  })
}
