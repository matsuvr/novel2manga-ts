import { z } from 'zod'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
// import { generateEpisodeLayout } from '@/services/application/layout-generation' // DEPRECATED: replaced by pageBreakEstimation
import { estimatePageBreaks } from '@/agents/script/page-break-estimator'
import { convertEpisodeTextToScript } from '@/agents/script/script-converter'
import { getChunkingConfig, getTextAnalysisConfig } from '@/config'
import type { Chunk } from '@/db/schema'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { getChunkRepository, getJobRepository, getNovelRepository } from '@/repositories'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { EpisodeBoundary } from '@/types/episode'
import type { AnalyzeResponse } from '@/types/job'
import type { PageBreakPlan } from '@/types/script'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { saveEpisodeBoundaries } from '@/utils/storage'
import { splitTextIntoSlidingChunks } from '@/utils/text-splitter'
import { generateUUID } from '@/utils/uuid'

export interface AnalyzeOptions {
  isDemo?: boolean
  title?: string
  /**
   * 事前に発行済みの jobId を指定する場合に使用。
   * 指定された場合、本クラス内では新規ジョブ作成（create）は行わず、
   * 以降のステップ更新のみを実施します。
   */
  existingJobId?: string
}

/**
 * AnalyzePipeline - Main production analysis service
 *
 * 責務: 小説テキストの分析からレイアウト生成・レンダリングまでの一連の処理
 * フロー: チャンク分割 → textAnalysis → narrativeArcAnalysis → scriptConversion → pageBreakEstimation → layout → render
 *
 * 使用箇所: /api/analyze (プロダクションメインエンドポイント)
 * テスト: src/__tests__/integration/service-integration.test.ts など多数
 *
 * Note: Orchestrator (scenario.ts) とは異なる責務を持つ
 * - AnalyzePipeline: ビジネスロジックの実装
 * - Orchestrator: APIチェーンの実行エンジン（開発・デモ用）
 *
 * 重要: このファイルでは「どこで何を I/O するか／LLM を呼ぶか」を日本語コメントで明示しています。
 * - 「ファイル/ストレージへ書き込む/読み込む」
 * - 「DB（D1/Drizzle 経由）へ書き込む/読み込む」
 * - 「LLM へプロンプトを渡す（呼び出す）」
 * を見つけやすくするため、各該当箇所の直前にコメントを追加しています。
 */
export class AnalyzePipeline {
  constructor(
    private readonly ports: StoragePorts = getStoragePorts(),
    // keep optional logger for future detailed tracing without lint noise
    _logger: LoggerPort = getLogger().withContext({
      service: 'analyze-pipeline',
    }),
  ) {}

  async runWithNovelId(novelId: string, options: AnalyzeOptions = {}) {
    // DB 上の小説存在確認（旧テスト互換: エラーメッセージに「データベース」文言を含める）
    // ここで「DBから小説メタデータを読み込む」
    const novelRepo = getNovelRepository()
    const dbNovel = await novelRepo.get(novelId)
    if (!dbNovel) {
      const { ApiError } = await import('@/utils/api-error')
      throw new ApiError('小説ID がデータベースに見つかりません', 404, 'NOT_FOUND')
    }

    // ストレージからテキスト取得（旧テスト互換: 「のテキストがストレージに見つかりません」）
    // ここで「ストレージ（ファイル）から小説本文を読み込む」
    const novel = await this.ports.novel.getNovelText(novelId)
    if (!novel?.text) {
      const { ApiError } = await import('@/utils/api-error')
      throw new ApiError('小説のテキストがストレージに見つかりません', 404, 'NOT_FOUND')
    }
    return this.runWithText(novelId, novel.text, options)
  }

  async runWithText(novelId: string, novelText: string, options: AnalyzeOptions = {}) {
    const logger = getLogger().withContext({ service: 'analyze-pipeline' })
    logger.info('AnalyzePipeline.runWithText: start', { novelId, textLength: novelText.length })
    const jobRepo = getJobRepository()
    const chunkRepo = getChunkRepository()
    const novelRepo = getNovelRepository()
    const db = getDatabaseService()
    const { episode: episodePort } = adaptAll(db)
    const episodeRepo = new EpisodeRepository(episodePort)

    // 既存の jobId が指定されていればそれを使用。なければ新規発行
    const jobId = options.existingJobId ?? generateUUID()
    const title = options.title || 'Novel'

    // まず小説を DB に保存してから job を作成する（FOREIGN KEY制約のため）
    try {
      // ここで「ストレージ（ファイル）に小説本文を JSON として書き込む」
      //   - key: novelId.json 等（実際のパスはポート実装依存）
      await this.ports.novel.putNovelText(
        novelId,
        JSON.stringify({ text: novelText, title: title || '' }),
      )
      // ここで「DBに小説メタデータ（タイトル等）を書き込む/存在保証する」
      //   - job の外部キー制約のために先に作成/確保しておく
      await novelRepo.ensure(novelId, {
        title: title || `Novel ${novelId.slice(0, 8)}`,
        author: 'Unknown',
        originalTextPath: `${novelId}.json`,
        textLength: novelText.length,
        language: 'ja',
        metadataPath: null,
      })
    } catch (e) {
      // ストレージ/DB への保存失敗は致命的エラーとして扱う（jobが作成できないため）
      const message = e instanceof Error ? e.message : String(e)
      getLogger().error('Failed to persist novel text or ensure novel before job creation', {
        error: message,
        novelId,
      })
      throw new Error(`Failed to create novel before job: ${message}`)
    }

    // 既にジョブが作成済みの場合は新規作成をスキップ
    if (!options.existingJobId) {
      // ここで「DBにジョブレコードを作成（書き込み）」
      //   - novelId を外部キーに持つ
      await jobRepo.create({
        id: jobId,
        novelId,
        title: `Analysis Job for ${title}`,
      })
    }

    // 機械的な固定長チャンク分割（オーバーラップ付き）
    // Rationale: sentence-based splitting caused instability across languages and inconsistent
    // segment sizes; sliding window chunking yields predictable boundaries and better LLM context
    // continuity, especially for Japanese text without clear punctuation.
    const chunkCfg = getChunkingConfig()
    // ここで「小説本文を固定長で分割（メモリ内処理。I/Oなし）」
    const chunks = splitTextIntoSlidingChunks(
      novelText,
      chunkCfg.defaultChunkSize,
      chunkCfg.defaultOverlapSize,
      {
        minChunkSize: chunkCfg.minChunkSize,
        maxChunkSize: chunkCfg.maxChunkSize,
        maxOverlapRatio: chunkCfg.maxOverlapRatio,
      },
    )
    // ここで「DBのジョブ進捗を更新（split ステップの総数設定）」
    await jobRepo.updateStep(jobId, 'split', 0, chunks.length)

    // Persist chunks to storage and collect DB rows
    let currentPosition = 0
    const rows: Array<Parameters<typeof chunkRepo.create>[0]> = []
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]
      // ここで「ストレージ（ファイル）にチャンク本文を書き込む」
      const key = await this.ports.chunk.putChunk(jobId, i, content)
      const startPos = currentPosition
      const endPos = currentPosition + content.length
      // ここで「DBにチャンクメタデータを保存するための行データを準備（まだ未書き込み）」
      rows.push({
        novelId,
        jobId,
        chunkIndex: i,
        contentPath: key,
        startPosition: startPos,
        endPosition: endPos,
        wordCount: content.length,
      })
      currentPosition = endPos
    }
    // ここで「DBにチャンクメタデータをバルク挿入（書き込み）」
    await chunkRepo.createBatch(rows)

    // ここで「DBのジョブ進捗を更新（split ステップの進行度更新）」
    await jobRepo.updateStep(jobId, 'split', 0, chunks.length)
    // ここで「DBのジョブ進捗を完了（split ステップ完了）」
    await jobRepo.markStepCompleted(jobId, 'split')

    // Analysis schema
    const nonEmptyObject = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
      schema.refine((obj) => Object.keys(obj).length > 0, {
        message: 'Empty object is not allowed',
      })

    const textAnalysisOutputSchema = z
      .object({
        characters: z.array(
          nonEmptyObject(
            z
              .object({
                name: z.string().nullable().optional(),
                description: z.string().nullable().optional(),
                firstAppearance: z.number().nullable().optional(),
              })
              .strip(),
          ),
        ),
        scenes: z.array(
          nonEmptyObject(
            z
              .object({
                location: z.string().nullable().optional(),
                time: z.string().nullable().optional(),
                description: z.string().nullable().optional(),
                startIndex: z.number().nullable().optional(),
                endIndex: z.number().nullable().optional(),
              })
              .strip(),
          ),
        ),
        dialogues: z.array(
          nonEmptyObject(
            z
              .object({
                speakerId: z.string().nullable().optional(),
                text: z.string().nullable().optional(),
                emotion: z.string().nullable().optional(),
                index: z.number().nullable().optional(),
              })
              .strip(),
          ),
        ),
        highlights: z.array(
          nonEmptyObject(
            z
              .object({
                type: z
                  .enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence'])
                  .nullable()
                  .optional(),
                description: z.string().nullable().optional(),
                importance: z.number().min(1).max(10).nullable().optional(),
                startIndex: z.number().nullable().optional(),
                endIndex: z.number().nullable().optional(),
                text: z.string().nullable().optional(),
              })
              .strip(),
          ),
        ),
        situations: z.array(
          nonEmptyObject(
            z
              .object({
                description: z.string().nullable().optional(),
                index: z.number().nullable().optional(),
              })
              .strip(),
          ),
        ),
      })
      .strip()

    // Analyze each chunk
    for (let i = 0; i < chunks.length; i++) {
      // ここで「DBのジョブ進捗を更新（analyze_chunk_i ステップ）」
      await jobRepo.updateStep(jobId, `analyze_chunk_${i}`, i, chunks.length)
      const chunkText = chunks[i]
      const config = getTextAnalysisConfig()
      if (!config?.userPromptTemplate) {
        throw new Error('Text analysis config is invalid: userPromptTemplate is missing')
      }
      const prevText = i > 0 ? chunks[i - 1] : ''
      const nextText = i + 1 < chunks.length ? chunks[i + 1] : ''
      // ここで「LLM に渡すユーザープロンプトを生成」
      const prompt = config.userPromptTemplate
        .replace('{{chunkIndex}}', i.toString())
        .replace('{{chunkText}}', chunkText)
        .replace('{{previousChunkText}}', prevText)
        .replace('{{nextChunkText}}', nextText)

      let result: z.infer<typeof textAnalysisOutputSchema>
      try {
        const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
        // ここで「LLM を呼び出してチャンクを分析（analyzeChunkWithFallback）」
        //   - prompt を LLM に渡す
        const analysis = await analyzeChunkWithFallback(prompt, textAnalysisOutputSchema, {
          maxRetries: 0,
          jobId,
          chunkIndex: i,
        })
        result = analysis.result
      } catch (firstError) {
        logger.warn('Chunk analysis failed, retrying', {
          jobId,
          chunkIndex: i,
          error: firstError instanceof Error ? firstError.message : String(firstError),
        })
        // ここで「DBのジョブ進捗を更新（リトライの記録）」
        await jobRepo.updateStep(jobId, `analyze_chunk_${i}_retry`, i, chunks.length)

        try {
          const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
          // ここで「LLM を再度呼び出してチャンクを分析（リトライ）」
          const analysis = await analyzeChunkWithFallback(prompt, textAnalysisOutputSchema, {
            maxRetries: 0,
            jobId,
            chunkIndex: i,
          })
          result = analysis.result
        } catch (retryError) {
          const errorMessage = retryError instanceof Error ? retryError.message : String(retryError)
          logger.error('Chunk analysis failed after retry', {
            jobId,
            chunkIndex: i,
            firstError: firstError instanceof Error ? firstError.message : String(firstError),
            retryError: errorMessage,
          })

          // ジョブステータスを失敗に更新
          // ここで「DBのジョブステータスを failed に更新（書き込み）」
          await jobRepo.updateStatus(jobId, 'failed', `Chunk ${i} analysis failed: ${errorMessage}`)
          throw retryError
        }
      }
      if (!result) {
        const errorMessage = `Failed to generate analysis result for chunk ${i}`
        logger.error(errorMessage, { jobId, chunkIndex: i })
        // ここで「DBのジョブステータスを failed に更新（書き込み）」
        await jobRepo.updateStatus(jobId, 'failed', errorMessage)
        throw new Error(errorMessage)
      }

      const analysisData = {
        chunkIndex: i,
        jobId,
        analysis: result,
        analyzedAt: new Date().toISOString(),
      }
      // ここで「ストレージ（ファイル）にチャンク分析結果を書き込む」
      await this.ports.analysis.putAnalysis(jobId, i, JSON.stringify(analysisData, null, 2))
      // ここで「DBのジョブ進捗を更新（analyze_chunk_i 完了）」
      await jobRepo.updateStep(jobId, `analyze_chunk_${i}_done`, i + 1, chunks.length)
    }

    // ここで「DBのジョブ進捗を完了（analyze ステップ完了）」
    await jobRepo.markStepCompleted(jobId, 'analyze')

    // Episode boundaries
    // ここで「エピソード分析の入力を準備（必要なストレージ/DBから読み出して集約する処理）」
    const input = await prepareNarrativeAnalysisInput({
      jobId,
      startChunkIndex: 0,
    })
    if (!input) throw new Error('Failed to prepare narrative analysis input')

    const chunkRepository = new (
      await import('@/infrastructure/storage/chunk-repository')
    ).StorageChunkRepository()

    let boundaries: EpisodeBoundary[]
    try {
      // ここで「LLM を呼び出して物語構造（ナラティブアーク）を分析し、エピソード境界を推定」
      //   - input（集約済みテキスト等）を LLM に渡す
      boundaries = (await analyzeNarrativeArc(input, chunkRepository)) ?? []
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Narrative arc analysis failed', {
        jobId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })

      // コンソールにも構造化ログを出力
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          service: 'analyze-pipeline',
          operation: 'narrative-arc-analysis',
          msg: 'Narrative arc analysis failed',
          jobId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
        }),
      )

      // ジョブステータスを失敗に更新
      try {
        // ここで「DBのジョブステータスを failed に更新（書き込み）」
        await jobRepo.updateStatus(jobId, 'failed', errorMessage)
      } catch (statusError) {
        logger.error('Failed to update job status after narrative analysis failure', {
          jobId,
          originalError: errorMessage,
          statusError: statusError instanceof Error ? statusError.message : String(statusError),
        })
      }

      throw error
    }
    if (Array.isArray(boundaries) && boundaries.length > 0) {
      // ここで「検出したエピソード境界をストレージ/DBへ保存（ユーティリティで一括）」（書き込み）
      await saveEpisodeBoundaries(jobId, boundaries)
      // ここで「DBのジョブ進捗を完了（episode ステップ完了）」
      await jobRepo.markStepCompleted(jobId, 'episode')
      // ここで「DBのジョブ進捗を更新（layout ステップの総数設定）」
      await jobRepo.updateStep(jobId, 'layout', chunks.length, chunks.length)

      // Generate page breaks for each episode
      const episodeNumbers = boundaries.map((b) => b.episodeNumber).sort((a, b) => a - b)
      let totalPages = 0

      for (const ep of episodeNumbers) {
        try {
          // Get episode text for script conversion
          // ここで「DBからエピソード情報を読み込む」
          const episodes = await episodeRepo.getByJobId(jobId)
          const episode = episodes.find((e) => e.episodeNumber === ep)
          if (!episode) {
            throw new Error(`Episode ${ep} not found`)
          }

          // Get episode text from chunks
          // ここで「DBからチャンクメタデータ一覧を読み込む」
          const chunkRepo = getChunkRepository()
          const chunksMetadata = await chunkRepo.getByJobId(jobId)

          // Validate episode boundaries
          if (
            episode.startChunk < 0 ||
            episode.endChunk < 0 ||
            episode.startChunk > episode.endChunk
          ) {
            const errorMessage = `Invalid episode boundaries for episode ${ep}: startChunk=${episode.startChunk}, endChunk=${episode.endChunk}`
            logger.error('Invalid episode boundaries detected', {
              jobId,
              episodeNumber: ep,
              startChunk: episode.startChunk,
              endChunk: episode.endChunk,
              startCharIndex: episode.startCharIndex,
              endCharIndex: episode.endCharIndex,
            })
            throw new Error(errorMessage)
          }

          logger.info('Starting episode text extraction', {
            jobId,
            episodeNumber: ep,
            totalChunksInJob: chunksMetadata.length,
            episodeStartChunk: episode.startChunk,
            episodeEndChunk: episode.endChunk,
            episodeStartChar: episode.startCharIndex,
            episodeEndChar: episode.endCharIndex,
          })

          let episodeText = ''
          let processedChunks = 0

          // Clamp episode boundaries to available chunk indices
          const availableIndices = chunksMetadata
            .map((c) => (c as Chunk).chunkIndex)
            .sort((a, b) => a - b)
          const minIdx = availableIndices.length > 0 ? availableIndices[0] : 0
          const maxIdx =
            availableIndices.length > 0 ? availableIndices[availableIndices.length - 1] : 0
          const adjStartChunk = Math.max(minIdx, Math.min(maxIdx, episode.startChunk))
          const adjEndChunk = Math.max(adjStartChunk, Math.min(maxIdx, episode.endChunk))

          if (adjStartChunk !== episode.startChunk || adjEndChunk !== episode.endChunk) {
            logger.warn('Adjusted episode chunk boundaries to available range', {
              jobId,
              episodeNumber: ep,
              originalStartChunk: episode.startChunk,
              originalEndChunk: episode.endChunk,
              adjustedStartChunk: adjStartChunk,
              adjustedEndChunk: adjEndChunk,
              availableIndices,
            })
          }

          for (const chunkMeta of chunksMetadata) {
            const chunk = chunkMeta as Chunk
            logger.info('Processing chunk metadata', {
              jobId,
              episodeNumber: ep,
              chunkIndex: chunk.chunkIndex,
              episodeStartChunk: adjStartChunk,
              episodeEndChunk: adjEndChunk,
              isInRange: chunk.chunkIndex >= adjStartChunk && chunk.chunkIndex <= adjEndChunk,
            })

            if (chunk.chunkIndex >= adjStartChunk && chunk.chunkIndex <= adjEndChunk) {
              // Get actual chunk text from storage
              // ここで「ストレージ（ファイル）から対象チャンク本文を読み込む」
              const chunkContent = await this.ports.chunk.getChunk(jobId, chunk.chunkIndex)
              if (!chunkContent?.text) {
                throw new Error(
                  `Chunk content not found for job ${jobId}, chunk ${chunk.chunkIndex}`,
                )
              }

              const startIndexRaw = chunk.chunkIndex === adjStartChunk ? episode.startCharIndex : 0
              const startIndex = Math.max(
                0,
                Math.min(
                  chunkContent.text.length,
                  typeof startIndexRaw === 'number' ? startIndexRaw : 0,
                ),
              )
              // endIndex は endChunk のときに未定義の場合があるため安全側で補正し、文字数範囲にクランプ
              const endIndexRaw =
                chunk.chunkIndex === adjEndChunk
                  ? typeof episode.endCharIndex === 'number'
                    ? episode.endCharIndex
                    : chunkContent.text.length
                  : chunkContent.text.length
              const endIndex = Math.max(0, Math.min(chunkContent.text.length, endIndexRaw))

              // guard: ensure non-negative length
              const safeStart = Math.min(startIndex, endIndex)
              const safeEnd = Math.max(endIndex, startIndex)

              const extractedText = chunkContent.text.substring(safeStart, safeEnd)
              episodeText += extractedText
              processedChunks++

              logger.info('Extracted text from chunk', {
                jobId,
                episodeNumber: ep,
                chunkIndex: chunk.chunkIndex,
                chunkTextLength: chunkContent.text.length,
                extractedLength: extractedText.length,
                startIndex: safeStart,
                endIndex: safeEnd,
                extractedPreview: `${extractedText.substring(0, 50)}...`,
              })
            }
          }

          logger.info('Episode text extraction completed', {
            jobId,
            episodeNumber: ep,
            processedChunks,
            totalEpisodeTextLength: episodeText.length,
          })

          // Validate episode text before script conversion
          if (!episodeText || episodeText.trim().length === 0) {
            const errorMessage = `Episode text is empty for episode ${ep}. Expected content from narrative arc analysis but got: "${episodeText}" (startChunk=${episode.startChunk}, endChunk=${episode.endChunk}, startCharIndex=${episode.startCharIndex}, endCharIndex=${episode.endCharIndex})`
            logger.error('Empty episode text detected', {
              jobId,
              episodeNumber: ep,
              episodeTextLength: episodeText.length,
              episodeStartChunk: episode.startChunk,
              episodeEndChunk: episode.endChunk,
              episodeStartChar: episode.startCharIndex,
              episodeEndChar: episode.endCharIndex,
              chunksFound: chunksMetadata.length,
              processedChunks,
              allChunkIndices: chunksMetadata.map((c) => (c as Chunk).chunkIndex),
              adjustedStartChunk: adjStartChunk,
              adjustedEndChunk: adjEndChunk,
            })
            throw new Error(errorMessage)
          }

          if (processedChunks === 0) {
            const errorMessage = `No chunks were processed for episode ${ep}. This indicates episode boundaries don't match available chunks.`
            logger.error('No chunks processed for episode', {
              jobId,
              episodeNumber: ep,
              episodeStartChunk: episode.startChunk,
              episodeEndChunk: episode.endChunk,
              availableChunkIndices: chunksMetadata.map((c) => (c as Chunk).chunkIndex),
            })
            throw new Error(errorMessage)
          }

          logger.info('Episode text extracted successfully', {
            jobId,
            episodeNumber: ep,
            episodeTextLength: episodeText.length,
            episodeStartChunk: episode.startChunk,
            episodeEndChunk: episode.endChunk,
            episodePreview: `${episodeText.substring(0, 100)}...`,
          })

          // Convert episode text to script
          // ここで「LLM を呼び出してエピソード本文を台本スクリプト形式に変換」
          const script = await convertEpisodeTextToScript(episodeText, {
            jobId,
            episodeNumber: ep,
          })

          // Estimate page breaks
          // ここで「LLM（またはエージェント）を呼び出してページ割り（コマ割り）を推定」
          const pageBreakPlan = await estimatePageBreaks(script, {
            avgLinesPerPage: 20, // TODO: calculate from episode.estimatedPages
            jobId,
            episodeNumber: ep,
          })

          // Store page break plan
          const ports = getStoragePorts()
          // ここで「ストレージ（ファイル）にページ割り計画を JSON として書き込む」
          await ports.layout.putEpisodeLayout(jobId, ep, JSON.stringify(pageBreakPlan, null, 2))

          // Count total pages for this episode
          totalPages += pageBreakPlan.pages.length

          logger.info('Page break estimation completed', {
            jobId,
            episodeNumber: ep,
            pagesInEpisode: pageBreakPlan.pages.length,
            runningTotal: totalPages,
          })
        } catch (pageBreakError) {
          const errorMessage =
            pageBreakError instanceof Error ? pageBreakError.message : String(pageBreakError)
          logger.error('Page break estimation failed', {
            jobId,
            episodeNumber: ep,
            error: errorMessage,
          })

          // ジョブステータスを失敗に更新
          // ここで「DBのジョブステータスを failed に更新（書き込み）」
          await jobRepo.updateStatus(
            jobId,
            'failed',
            `Episode ${ep} page break estimation failed: ${errorMessage}`,
          )
          throw pageBreakError
        }
      }

      // Update totalPages based on pageBreakEstimation results
      // ここで「DBに総ページ数を保存（書き込み）」
      await jobRepo.updateJobTotalPages(jobId, totalPages)
      // ここで「DBのジョブ進捗を完了（layout ステップ完了）」
      await jobRepo.markStepCompleted(jobId, 'layout')
      // ここで「DBのジョブ進捗を更新（render ステップの総数＝総ページ数）」
      await jobRepo.updateStep(jobId, 'render', 0, totalPages)

      logger.info('Page break estimation completed for all episodes', {
        jobId,
        totalPages,
        episodeCount: episodeNumbers.length,
      })

      // デモやテスト環境では重いレンダリングをスキップ
      const shouldRender = !options.isDemo && process.env.NODE_ENV !== 'test'
      if (shouldRender) {
        try {
          // Render pages for each episode
          const ports = getStoragePorts()
          for (const ep of episodeNumbers) {
            // ここで「ストレージ（ファイル）からページ割り計画 JSON を読み込む」
            const pageBreakPlanText = await ports.layout.getEpisodeLayout(jobId, ep)
            if (pageBreakPlanText) {
              const pageBreakPlan: PageBreakPlan = JSON.parse(pageBreakPlanText)
              const { renderFromPageBreakPlan } = await import('@/services/application/render')
              // ここで「レンダリングサービスを呼び出す（画像等を生成しストレージへ書き出す）」
              await renderFromPageBreakPlan(jobId, ep, pageBreakPlan, ports, {
                skipExisting: false,
                concurrency: 3,
              })
            }
          }
          logger.info('PageBreakPlan rendering completed for all episodes', { jobId })
        } catch (renderError) {
          const errorMessage =
            renderError instanceof Error ? renderError.message : String(renderError)
          logger.error('PageBreakPlan rendering failed', {
            jobId,
            error: errorMessage,
          })
        }
      } else {
        getLogger().warn('Skipping render in demo/test environment', {
          jobId,
          totalPages,
          error: 'Demo/test environment',
        })
      }

      // すべてのエピソードの処理完了後、ステップ/ステータスを確定
      // ここで「DBのジョブ進捗（complete ステップ）とステータスを完了（書き込み）」
      await jobRepo.updateStep(jobId, 'complete')
      await jobRepo.updateStatus(jobId, 'completed')
    } else {
      // エピソードが検出されなかった場合もジョブを完了させる
      // ここで「DBのジョブ進捗を完了（episode ステップ完了）」
      await jobRepo.markStepCompleted(jobId, 'episode')
      const response: AnalyzeResponse = {
        success: true,
        id: jobId,
        message: `テキストを${chunks.length}個のチャンクに分割し、分析を完了しました（エピソードは検出されませんでした）`,
        data: { jobId, chunkCount: chunks.length },
        metadata: { timestamp: new Date().toISOString() },
      }
      // 完了ステップへ遷移（UIの完了判定を確実にする）
      // ここで「DBのジョブ進捗（complete ステップ）とステータスを完了（書き込み）」
      await jobRepo.updateStep(jobId, 'complete')
      await jobRepo.updateStatus(jobId, 'completed')
      return { jobId, chunkCount: chunks.length, response }
    }

    const response: AnalyzeResponse = {
      success: true,
      id: jobId,
      message: `テキストを${chunks.length}個のチャンクに分割し、分析を完了しました`,
      data: { jobId, chunkCount: chunks.length },
      metadata: { timestamp: new Date().toISOString() },
    }
    // 完了ステップへ遷移（UIの完了判定を確実にする）
    // ここで「DBのジョブ進捗（complete ステップ）とステータスを完了（書き込み）」
    await jobRepo.updateStep(jobId, 'complete')
    await jobRepo.updateStatus(jobId, 'completed')
    logger.info('AnalyzePipeline.runWithText: completed', { jobId, chunkCount: chunks.length })
    return { jobId, chunkCount: chunks.length, response }
  }
}
