import yaml from 'js-yaml'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { generateMangaLayout } from '@/agents/layout-generator'
import { getEpisodeRepository, getJobRepository } from '@/repositories'
import { getDatabaseService } from '@/services/db-factory'
import type { ChunkData, EpisodeData } from '@/types/panel-layout'
import { ApiError, createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { detectDemoMode } from '@/utils/request-mode'
import { getChunkData, StorageFactory, StorageKeys } from '@/utils/storage'

const requestSchema = z.object({
  jobId: z.string(),
  episodeNumber: z.number().int().positive(),
  config: z
    .object({
      panelsPerPage: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
          average: z.number().optional(),
        })
        .optional(),
      dialogueDensity: z.number().min(0).max(1).optional(),
      visualComplexity: z.number().min(0).max(1).optional(),
      highlightPanelSizeMultiplier: z.number().min(1).max(3).optional(),
      readingDirection: z.literal('right-to-left').optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = requestSchema.parse(body)
    const { jobId, episodeNumber, config } = validatedData
    const isDemo = detectDemoMode(request, body)

    const episodeRepo = getEpisodeRepository()
    const jobRepo = getJobRepository()

    // デモ時はジョブ/エピソード存在チェックを緩め、なければ仮構築
    const job = await jobRepo.getJobWithProgress(jobId).catch(() => null)
    if (!job && !isDemo) {
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
    }
    const episodes = await episodeRepo.getByJobId(jobId).catch(() => [])
    let episode = episodes.find((ep) => ep.episodeNumber === episodeNumber)
    if (!episode) {
      if (isDemo) {
        episode = {
          id: `demo-${jobId}-ep${episodeNumber}`,
          novelId: job?.novelId || `demo-novel-${jobId}`,
          jobId,
          episodeNumber,
          title: 'Demo Episode',
          summary: 'デモ用の自動作成エピソード',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 0,
          endCharIndex: 0,
          estimatedPages: 1,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        }
      } else {
        throw new ApiError('Episode not found', 404, 'NOT_FOUND')
      }
    }

    // ここまででepisodeは必ず存在
    const ensuredEpisode = episode

    // エピソードに含まれるチャンクの解析結果を取得
    const chunkDataArray: ChunkData[] = []

    if (isDemo) {
      // 解析結果なしで固定の最小データを用意
      chunkDataArray.push({
        chunkIndex: 0,
        text: 'デモ用の短いテキスト',
        analysis: {
          chunkIndex: 0,
          summary: 'デモ用サマリ',
          characters: [{ name: '太郎', role: 'protagonist', description: '主人公' }],
          dialogues: [
            {
              speaker: '太郎',
              text: 'やってみよう！',
              emotion: 'excited',
              context: '',
            },
          ],
          scenes: [
            {
              id: 'scene-0',
              location: '公園',
              time: '昼',
              description: 'ベンチのある公園',
              startIndex: 0,
              endIndex: 10,
            },
          ],
          highlights: [
            {
              type: 'emotional_peak',
              description: '決意の瞬間',
              importance: 8,
              text: 'やってみよう！',
              reason: 'demo',
            },
          ],
          situations: [{ event: 'start', description: '新しい挑戦', significance: 'high' }],
        },
        isPartial: false,
        startOffset: 0,
        endOffset: 10,
      })
    } else {
      for (let i = ensuredEpisode.startChunk; i <= ensuredEpisode.endChunk; i++) {
        const chunkContent = await getChunkData(jobId, i)
        if (!chunkContent) {
          throw new Error(
            `Chunk ${i} not found for job ${jobId}. Cannot proceed with layout generation.`,
          )
        }

        // チャンク解析結果を取得（Storage経由）
        try {
          const analysisStorage = await StorageFactory.getAnalysisStorage()
          const key = StorageKeys.chunkAnalysis(jobId, i)
          const obj = await analysisStorage.get(key)
          if (!obj) {
            throw new Error('analysis not found')
          }
          const parsed = JSON.parse(obj.text)
          const analysis = parsed.analysis ?? parsed

          // エピソード境界を考慮した部分チャンクの処理
          const isPartial = i === ensuredEpisode.startChunk || i === ensuredEpisode.endChunk
          const startOffset = i === ensuredEpisode.startChunk ? ensuredEpisode.startCharIndex : 0
          const endOffset =
            i === ensuredEpisode.endChunk ? ensuredEpisode.endCharIndex : chunkContent.text.length

          chunkDataArray.push({
            chunkIndex: i,
            text: chunkContent.text.substring(startOffset, endOffset),
            analysis: analysis,
            isPartial,
            startOffset,
            endOffset,
          })
        } catch (error) {
          console.error(`Failed to load analysis for chunk ${i}:`, error)
        }
      }
    }

    if (chunkDataArray.length === 0) {
      throw new ApiError('Chunk analysis data not found', 404, 'NOT_FOUND')
    }

    // エピソードデータを構築
    const episodeData: EpisodeData = {
      chunkAnalyses: chunkDataArray.map((chunk) => chunk.analysis),
      author: job?.jobName || 'Unknown Author',
      title: `Episode ${ensuredEpisode.episodeNumber}` as const,
      episodeNumber: ensuredEpisode.episodeNumber,
      episodeTitle: ensuredEpisode.title || undefined,
      episodeSummary: ensuredEpisode.summary || undefined,
      startChunk: ensuredEpisode.startChunk,
      startCharIndex: ensuredEpisode.startCharIndex,
      endChunk: ensuredEpisode.endChunk,
      endCharIndex: ensuredEpisode.endCharIndex,
      estimatedPages: ensuredEpisode.estimatedPages,
      chunks: chunkDataArray,
    }

    // レイアウトを生成
    // 進捗: 現在のエピソードをレイアウト中としてcurrentStepを更新
    try {
      const dbService = getDatabaseService()
      await dbService.updateJobStep(jobId, `layout_episode_${episodeNumber}`)
    } catch (e) {
      console.warn('[layout/generate] Failed to set step layout_episode:', e)
    }
    // デフォルト値を設定してLayoutGenerationConfigを満たす
    const fullConfig = {
      panelsPerPage: {
        min: config?.panelsPerPage?.min ?? 3,
        max: config?.panelsPerPage?.max ?? 6,
        average: config?.panelsPerPage?.average ?? 4.5,
      },
      dialogueDensity: config?.dialogueDensity ?? 0.6,
      visualComplexity: config?.visualComplexity ?? 0.7,
      highlightPanelSizeMultiplier: config?.highlightPanelSizeMultiplier ?? 2.0,
      readingDirection: config?.readingDirection ?? ('right-to-left' as const),
    }
    // デモ時は固定1ページレイアウトを返す（エージェント非依存）
    const layout = isDemo
      ? {
          title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
          author: job?.jobName || 'Demo',
          created_at: new Date().toISOString().split('T')[0],
          episodeNumber: episodeData.episodeNumber,
          episodeTitle: episodeData.episodeTitle,
          pages: [
            {
              page_number: 1,
              panels: [
                {
                  id: 'p1',
                  position: { x: 40, y: 40 },
                  size: { width: 360, height: 220 },
                  content: '場所: 公園\n新しい挑戦',
                  dialogues: [
                    {
                      speaker: '太郎',
                      text: 'やってみよう！',
                      emotion: 'excited',
                    },
                  ],
                  sourceChunkIndex: 0,
                  importance: 8,
                },
              ],
            },
          ],
        }
      : await generateMangaLayout(episodeData, fullConfig)

    // YAMLファイルとして保存（StorageFactory経由）
    const yamlContent = yaml.dump(layout, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })

    const layoutStorage = await StorageFactory.getLayoutStorage()
    const storageKey = StorageKeys.episodeLayout(jobId, episodeNumber)
    await layoutStorage.put(storageKey, yamlContent)

    // レイアウト完了をジョブに反映（UIの進捗更新用）
    try {
      const dbService = getDatabaseService()
      await dbService.markJobStepCompleted(jobId, 'layout')
      await dbService.updateJobStep(jobId, 'render')
    } catch (e) {
      console.warn('[layout/generate] Failed to update job step to render:', e)
    }

    return createSuccessResponse({
      message: 'Layout generated successfully',
      jobId,
      episodeNumber,
      storageKey,
      // Backward compatibility alias (TODO: remove after 2025-09-01)
      layoutPath: storageKey,
      layout,
    })
  } catch (error) {
    console.error('Error generating layout:', error)
    // 失敗時はジョブに明確なエラー理由とステップを記録
    try {
      const dbService = getDatabaseService()
      const url = new URL(request.url)
      const jobIdFromQuery = url.searchParams.get('jobId')
      const safeJobId = jobIdFromQuery || 'unknown'
      await dbService.updateJobError(
        safeJobId,
        `Layout generation failed: ${error instanceof Error ? error.message : String(error)}`,
        'layout',
      )
    } catch {
      // noop
    }
    return createErrorResponse(error, 'Failed to generate layout')
  }
}
