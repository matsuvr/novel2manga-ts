import { z } from 'zod'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { getTextAnalysisConfig } from '@/config'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { getChunkRepository, getJobRepository, getNovelRepository } from '@/repositories'
import { generateEpisodeLayout } from '@/services/application/layout-generation'
import type { AnalyzeResponse } from '@/types/job'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { saveEpisodeBoundaries } from '@/utils/storage'
import { splitTextIntoChunks } from '@/utils/text-splitter'
import { generateUUID } from '@/utils/uuid'

export interface AnalyzeOptions {
  isDemo?: boolean
  title?: string
}

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
    const jobRepo = getJobRepository()
    const chunkRepo = getChunkRepository()
    const novelRepo = getNovelRepository()

    const jobId = generateUUID()
    const title = options.title || 'Novel'

    await jobRepo.create({
      id: jobId,
      novelId,
      title: `Analysis Job for ${title}`,
    })

    // 入力小説テキストを Novel ストレージにも保存（idempotent）
    try {
      await this.ports.novel.putNovelText(
        novelId,
        JSON.stringify({ text: novelText, title: title || '' }),
      )
      // DB にノベルの存在を保証（エラーは握り潰し）
      await novelRepo.ensure(novelId, {
        title: title || `Novel ${novelId.slice(0, 8)}`,
        author: 'Unknown',
        originalTextPath: `${novelId}.json`,
        textLength: novelText.length,
        language: 'ja',
        metadataPath: null,
      })
    } catch (e) {
      // ストレージ/DB への保存失敗は致命ではないので継続
      getLogger().warn('Failed to persist novel text or ensure novel; continue', {
        error: e instanceof Error ? e.message : String(e),
        novelId,
      })
    }

    const chunks = splitTextIntoChunks(novelText)
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
      const prompt = config.userPromptTemplate
        .replace('{{chunkIndex}}', i.toString())
        .replace('{{chunkText}}', chunkText)
        .replace('{{previousChunkText}}', '')
        .replace('{{nextChunkText}}', '')

      let result: z.infer<typeof textAnalysisOutputSchema>
      try {
        const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
        const analysis = await analyzeChunkWithFallback(prompt, textAnalysisOutputSchema, {
          maxRetries: 0,
          jobId,
          chunkIndex: i,
        })
        result = analysis.result
      } catch (_e) {
        await jobRepo.updateStep(jobId, `analyze_chunk_${i}_retry`, i, chunks.length)
        const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
        const analysis = await analyzeChunkWithFallback(prompt, textAnalysisOutputSchema, {
          maxRetries: 0,
          jobId,
          chunkIndex: i,
        })
        result = analysis.result
      }
      if (!result) throw new Error('Failed to generate analysis result')

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
    const boundaries = (await analyzeNarrativeArc(input, chunkRepository)) ?? []
    if (Array.isArray(boundaries) && boundaries.length > 0) {
      await saveEpisodeBoundaries(jobId, boundaries)
      await jobRepo.markStepCompleted(jobId, 'episode')
      await jobRepo.updateStep(jobId, 'layout', chunks.length, chunks.length)

      // Generate layout for each episode
      const episodeNumbers = boundaries.map((b) => b.episodeNumber).sort((a, b) => a - b)
      for (const ep of episodeNumbers) {
        await generateEpisodeLayout(jobId, ep, {
          isDemo: options.isDemo,
        })
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
    return { jobId, chunkCount: chunks.length, response }
  }
}
