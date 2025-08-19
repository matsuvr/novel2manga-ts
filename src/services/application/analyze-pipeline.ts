import { z } from 'zod'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import type { EpisodeBoundary } from '@/types/episode'
import { getChunkingConfig, getTextAnalysisConfig } from '@/config'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { getChunkRepository, getJobRepository, getNovelRepository } from '@/repositories'
import { generateEpisodeLayout } from '@/services/application/layout-generation'
import type { AnalyzeResponse } from '@/types/job'
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
    const novelRepo = getNovelRepository()
    const dbNovel = await novelRepo.get(novelId)
    if (!dbNovel) {
      const { ApiError } = await import('@/utils/api-error')
      throw new ApiError('小説ID がデータベースに見つかりません', 404, 'NOT_FOUND')
    }

    // ストレージからテキスト取得（旧テスト互換: 「のテキストがストレージに見つかりません」）
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

    // 既存の jobId が指定されていればそれを使用。なければ新規発行
    const jobId = options.existingJobId ?? generateUUID()
    const title = options.title || 'Novel'

    // まず小説を DB に保存してから job を作成する（FOREIGN KEY制約のため）
    try {
      await this.ports.novel.putNovelText(
        novelId,
        JSON.stringify({ text: novelText, title: title || '' }),
      )
      // DB にノベルの存在を保証（jobの外部キー制約を満たすため）
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
      // 小説が存在することを確認してからjobを作成
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
    await jobRepo.updateStep(jobId, 'split', 0, chunks.length)

    // Persist chunks to storage and collect DB rows
    let currentPosition = 0
    const rows: Array<Parameters<typeof chunkRepo.create>[0]> = []
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]
      const key = await this.ports.chunk.putChunk(jobId, i, content)
      const startPos = currentPosition
      const endPos = currentPosition + content.length
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
    await chunkRepo.createBatch(rows)

    await jobRepo.updateStep(jobId, 'split', 0, chunks.length)
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
      await jobRepo.updateStep(jobId, `analyze_chunk_${i}`, i, chunks.length)
      const chunkText = chunks[i]
      const config = getTextAnalysisConfig()
      if (!config?.userPromptTemplate) {
        throw new Error('Text analysis config is invalid: userPromptTemplate is missing')
      }
      const prevText = i > 0 ? chunks[i - 1] : ''
      const nextText = i + 1 < chunks.length ? chunks[i + 1] : ''
      const prompt = config.userPromptTemplate
        .replace('{{chunkIndex}}', i.toString())
        .replace('{{chunkText}}', chunkText)
        .replace('{{previousChunkText}}', prevText)
        .replace('{{nextChunkText}}', nextText)

      let result: z.infer<typeof textAnalysisOutputSchema>
      try {
        const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
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
        await jobRepo.updateStep(jobId, `analyze_chunk_${i}_retry`, i, chunks.length)

        try {
          const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
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
          await jobRepo.updateStatus(jobId, 'failed', `Chunk ${i} analysis failed: ${errorMessage}`)
          throw retryError
        }
      }
      if (!result) {
        const errorMessage = `Failed to generate analysis result for chunk ${i}`
        logger.error(errorMessage, { jobId, chunkIndex: i })
        await jobRepo.updateStatus(jobId, 'failed', errorMessage)
        throw new Error(errorMessage)
      }

      const analysisData = {
        chunkIndex: i,
        jobId,
        analysis: result,
        analyzedAt: new Date().toISOString(),
      }
      await this.ports.analysis.putAnalysis(jobId, i, JSON.stringify(analysisData, null, 2))
      await jobRepo.updateStep(jobId, `analyze_chunk_${i}_done`, i + 1, chunks.length)
    }

    await jobRepo.markStepCompleted(jobId, 'analyze')

    // Episode boundaries
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
      await saveEpisodeBoundaries(jobId, boundaries)
      await jobRepo.markStepCompleted(jobId, 'episode')
      await jobRepo.updateStep(jobId, 'layout', chunks.length, chunks.length)

      // Generate layout for each episode
      const episodeNumbers = boundaries.map((b) => b.episodeNumber).sort((a, b) => a - b)
      for (const ep of episodeNumbers) {
        try {
          await generateEpisodeLayout(jobId, ep, {
            isDemo: options.isDemo,
          })
        } catch (layoutError) {
          const errorMessage =
            layoutError instanceof Error ? layoutError.message : String(layoutError)
          logger.error('Episode layout generation failed', {
            jobId,
            episodeNumber: ep,
            error: errorMessage,
          })

          // ジョブステータスを失敗に更新
          await jobRepo.updateStatus(
            jobId,
            'failed',
            `Episode ${ep} layout generation failed: ${errorMessage}`,
          )
          throw layoutError
        }
        // デモやテスト環境では重いレンダリングをスキップ
        const shouldRender = !options.isDemo && process.env.NODE_ENV !== 'test'
        if (shouldRender) {
          // 直後にレンダリングを同期実行（プレビューで404を避ける）
          try {
            const ports = getStoragePorts()
            const yamlContent = (await ports.layout.getEpisodeLayout(jobId, ep)) || ''
            if (yamlContent) {
              const { renderBatchFromYaml } = await import('@/services/application/render')
              await renderBatchFromYaml(
                jobId,
                ep,
                yamlContent,
                undefined,
                { concurrency: 3 },
                ports,
              )
            }
          } catch (e) {
            getLogger().warn('Render kick failed after layout generation', {
              episodeNumber: ep,
              error: (e as Error).message,
            })
            throw e
          }
        } else {
          getLogger().warn('Skipping render in demo/test environment', {
            episodeNumber: ep,
            isDemo: options.isDemo === true,
            env: process.env.NODE_ENV,
          })
        }
      }
      // すべてのエピソードのレンダリング完了後、ステップ/ステータスを確定
      await jobRepo.updateStep(jobId, 'complete')
      await jobRepo.updateStatus(jobId, 'completed')
    } else {
      await jobRepo.markStepCompleted(jobId, 'episode')
      const response: AnalyzeResponse = {
        success: true,
        id: jobId,
        message: `テキストを${chunks.length}個のチャンクに分割し、分析を完了しました（エピソードは検出されませんでした）`,
        data: { jobId, chunkCount: chunks.length },
        metadata: { timestamp: new Date().toISOString() },
      }
      // 完了ステップへ遷移（UIの完了判定を確実にする）
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
    await jobRepo.updateStep(jobId, 'complete')
    await jobRepo.updateStatus(jobId, 'completed')
    logger.info('AnalyzePipeline.runWithText: completed', { jobId, chunkCount: chunks.length })
    return { jobId, chunkCount: chunks.length, response }
  }
}
