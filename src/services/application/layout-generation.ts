import { analyzeImportanceDistribution, calculateImportanceBasedPageBreaks, validateScriptImportance } from '@/agents/script/importance-based-page-break'
import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import type { Episode } from '@/db'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { getPorts } from '@/ports/factory'
import type { JobWithProgress } from '@/services/database'
import { db as dbFactory } from '@/services/database'
import type { MangaLayout } from '@/types/panel-layout'
import type { NewMangaScript, PageBreakV2 } from '@/types/script'
import { isTestEnv } from '@/utils/env'
import { normalizeImportanceDistribution } from '@/utils/panel-importance'
import { JsonStorageKeys, StorageKeys } from '@/utils/storage'

// CONCURRENCY: In-memory lock to prevent race conditions in layout generation
// This map tracks active layout generation processes to prevent multiple
// concurrent generations for the same episode, which could lead to data corruption
// or inconsistent progress updates.
const activeLayoutGenerations = new Map<string, Promise<GenerateLayoutResult>>()

export interface LayoutGenerationConfig {
  panelsPerPage?: { min?: number; max?: number; average?: number }
  dialogueDensity?: number
  visualComplexity?: number
  highlightPanelSizeMultiplier?: number
  readingDirection?: 'right-to-left'
}

export interface GenerateLayoutOptions {
  isDemo?: boolean
  triggerRender?: boolean
  config?: LayoutGenerationConfig
}

export interface GenerateLayoutResult {
  layout: MangaLayout
  storageKey: string
  pageNumbers: number[]
}

// 旧レイアウト計画用の複雑な定数 (_DEFAULT_LAYOUT_CONFIG) は importance ベース単純ページ割りに移行したため削除。

export async function generateEpisodeLayout(
  jobId: string,
  episodeNumber: number,
  options: GenerateLayoutOptions = {},
  _ports: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({
    jobId,
    episodeNumber,
    service: 'layout-generation',
  }),
): Promise<GenerateLayoutResult> {
  // CONCURRENCY: Create unique key for this episode layout generation
  const lockKey = `${jobId}:${episodeNumber}`

  // Check if this episode is already being processed
  const existingGeneration = activeLayoutGenerations.get(lockKey)
  if (existingGeneration) {
    logger.info('Layout generation already in progress, waiting for completion', { lockKey })
    return existingGeneration
  }

  // Create and register the generation promise
  const generationPromise = generateEpisodeLayoutInternal(
    jobId,
    episodeNumber,
    options,
    _ports,
    logger,
  )
  activeLayoutGenerations.set(lockKey, generationPromise)

  try {
    const result = await generationPromise
    return result
  } finally {
    // Always clean up the lock when done (success or failure)
    activeLayoutGenerations.delete(lockKey)
  }
}

/**
 * Initialize dependencies and repositories for layout generation
 */
function initializeLayoutDependencies(_jobId: string, _episodeNumber: number, _logger: LoggerPort) {
  const episodeRepo = {
    getByJobId: (jobId: string) => Promise.resolve(dbFactory.episodes().getEpisodesByJobId(jobId)),
  }
  const jobRepo = {
    getJobWithProgress: (id: string) => Promise.resolve(dbFactory.jobs().getJobWithProgress(id)),
    markStepCompleted: (id: string, step: 'split' | 'analyze' | 'episode' | 'layout' | 'render') =>
      Promise.resolve(dbFactory.jobs().markJobStepCompleted(id, step)),
    updateStep: (id: string, step: string) =>
      Promise.resolve(dbFactory.jobs().updateJobStep(id, step)),
  }
  return { episodeRepo, jobRepo }
}

/**
 * Resolve episode data, creating demo episode if needed
 */
async function resolveEpisodeData(
  jobId: string,
  episodeNumber: number,
  isDemo: boolean,
  episodeRepo: { getByJobId: (jobId: string) => Promise<Episode[]> },
  jobRepo: { getJobWithProgress: (id: string) => Promise<JobWithProgress | null> },
  logger: LoggerPort,
) {
  const job = await jobRepo.getJobWithProgress(jobId).catch((e) => {
    logger.warn('getJobWithProgress failed', { error: (e as Error).message })
    return null
  })
  let episodes: Episode[]
  try {
    episodes = await episodeRepo.getByJobId(jobId)
  } catch (error) {
    logger.error('Failed to retrieve episodes for job', {
      jobId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    // Repository policy: do not fallback on infrastructure/db errors
    throw error
  }
  let episode = episodes.find((ep) => ep.episodeNumber === episodeNumber) || null

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
        confidence: 0.9,
        createdAt: new Date().toISOString(),
        episodeTextPath: null,
      } as Episode
    } else {
      logger.error('Episode not found')
      throw new Error('Episode not found')
    }
  }

  if (!episode) {
    throw new Error('Episode could not be resolved')
  }

  return episode
}

// 旧フロー撤去: chunk再構築 / スクリプト変換 / LLMページ割り推定 / 進捗復元
// 新フロー: combined script → importance正規化 (目標比率) → 累計>=6で改ページ → レイアウト構築

async function generateEpisodeLayoutInternal(
  jobId: string,
  episodeNumber: number,
  options: GenerateLayoutOptions = {},
  _storagePorts: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({
    jobId,
    episodeNumber,
    service: 'layout-generation',
  }),
): Promise<GenerateLayoutResult> {
  logger.info('layout:start', { jobId, episodeNumber })
  const isDemo = options.isDemo === true

  // Initialize dependencies
  const { episodeRepo, jobRepo } = initializeLayoutDependencies(jobId, episodeNumber, logger)

  // Resolve episode data
  const episode = await resolveEpisodeData(
    jobId,
    episodeNumber,
    isDemo,
    episodeRepo,
    jobRepo,
    logger,
  )
  // テスト環境では、episodeが存在しない場合に最低限のダミーを生成して先へ進める
  if (!episode && isTestEnv()) {
    try {
      const jobRow = await jobRepo.getJobWithProgress(jobId)
      const fallbackEpisode = {
        id: `test-${jobId}-ep${episodeNumber}`,
        novelId: jobRow?.novelId || `test-novel-${jobId}`,
        jobId,
        episodeNumber,
        title: 'Test Episode',
        summary: 'Auto-generated for test',
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 0,
        endCharIndex: 0,
        confidence: 0.9,
        createdAt: new Date().toISOString(),
        episodeTextPath: null,
      } as Episode
      await dbFactory.episodes().createEpisode({
        novelId: fallbackEpisode.novelId,
        jobId,
        episodeNumber,
        title: fallbackEpisode.title ?? undefined,
        summary: fallbackEpisode.summary ?? undefined,
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 0,
        endCharIndex: 0,
        confidence: 0.9,
      })
      logger.info('Episode created successfully', { jobId, episodeNumber })
    } catch (error) {
      logger.warn('Failed to create fallback demo episode', {
        jobId,
        episodeNumber,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Combined script 読込 (先行 analyze-pipeline で保存済み)
  const job = await jobRepo.getJobWithProgress(jobId).catch((e) => {
  logger.warn('job:fetch_failed_nonfatal', { error: (e as Error).message })
    return null
  })
  // Load combined script JSON
  const { StorageFactory } = await import('@/utils/storage')
  const analysisStorage = await StorageFactory.getAnalysisStorage()
  const combinedKey = JsonStorageKeys.scriptCombined({ novelId: episode.novelId, jobId })
  const combinedObj = await analysisStorage.get(combinedKey)
  if (!combinedObj) {
    throw new Error(`Combined script not found: ${combinedKey}`)
  }
  let script: NewMangaScript
  try {
    script = JSON.parse(combinedObj.text) as NewMangaScript
  } catch (e) {
    throw new Error(`Combined script parse failed: ${(e as Error).message}`)
  }
  if (!Array.isArray(script.panels) || script.panels.length === 0) {
    if (isDemo) {
      script = { panels: [{ no: 1, cut: 'demo', camera: 'medium', narration: [], dialogue: [], importance: 3 }] } as unknown as NewMangaScript
    } else {
      throw new Error('Combined script has no panels')
    }
  }

  // Step update: layout in progress (best-effort in test env)
  try {
    await jobRepo.updateStep(jobId, `layout_episode_${episodeNumber}`)
  } catch (e) {
    logger.warn('job:update_step_failed_nonfatal', {
      jobId,
      episodeNumber,
      error: (e as Error).message,
    })
  }

  // ===== New simplified flow: combined script -> importance normalization -> importance page breaks -> layout =====
  try {
    // 1. 重要度値のバリデーション & ログ
    const validation = validateScriptImportance(script)
    if (!validation.valid) {
      logger.warn('importance:invalid_values_clamped', {
        episodeNumber,
        issues: validation.issues.slice(0, 5),
        totalIssues: validation.issues.length,
      })
    }
    // 2. importance 分布の正規化 (1..6 目標比率) — 既存 normalizeImportanceDistribution を panel.importance に反映
    try {
      const importanceCandidates = script.panels.map((p, idx) => ({
        index: idx,
        rawImportance: typeof p.importance === 'number' ? p.importance : 1,
        dialogueCharCount: (p.dialogue || []).reduce((a, d) => a + (d.text?.length || 0), 0),
        narrationCharCount: (p.narration || []).reduce((a, t) => a + t.length, 0),
        contentLength: ((p.dialogue || []).map(d => d.text).join(' ') + (p.narration || []).join(' ')).length,
      }))
      const normalized = normalizeImportanceDistribution(importanceCandidates)
      for (const n of normalized) {
        // clamp just in case
        const imp = Math.max(1, Math.min(6, n.importance))
        script.panels[n.index].importance = imp
      }
      const distribution = analyzeImportanceDistribution(script)
      logger.info('importance:normalized', {
        episodeNumber,
        distribution: distribution.distribution,
        averageImportance: distribution.averageImportance,
        estimatedPages: distribution.estimatedPages,
      })
    } catch (impErr) {
      logger.warn('importance:normalization_failed_fallback_raw', {
        episodeNumber,
        error: impErr instanceof Error ? impErr.message : String(impErr),
      })
    }

    // 3. importance-based page break 計算 (閾値 6)
    const pbResult = calculateImportanceBasedPageBreaks(script)
    let pageBreaks: PageBreakV2 = pbResult.pageBreaks
    if (!pageBreaks.panels.length && isDemo) {
      pageBreaks = { panels: [{ pageNumber: 1, panelIndex: 1, content: 'demo', dialogue: [] }] }
    } else if (!pageBreaks.panels.length) {
      throw new Error('Importance-based page break produced 0 panels')
    }

    // Use buildLayoutFromPageBreaks imported statically for stronger typing
    // Explicit type matching the panel-assignment expected input
    type PanelAssignmentDialogue = {
      text: string
      speaker: string
      type?: 'speech' | 'thought' | 'narration'
    }
    type PanelAssignmentPageBreaks = {
      panels: {
        pageNumber: number
        content: string
        panelIndex: number
        dialogue?: PanelAssignmentDialogue[]
        sfx?: string[]
      }[]
    }

    // Normalize pageBreaks into the exact shape expected by panel-assignment
    function normalizePageBreaksForPanelAssignment(input: unknown): PanelAssignmentPageBreaks {
      const safe = (input as { panels?: unknown[] } | undefined) || { panels: [] }
      return {
        panels: (safe.panels || []).map((p) => {
          const row = (p as Record<string, unknown>) || {}
          const dialogueRaw = row.dialogue
          let dialogue: PanelAssignmentDialogue[] | undefined
          if (Array.isArray(dialogueRaw)) {
            dialogue = dialogueRaw.map((d) => {
              const rd = d as Record<string, unknown>
              const text = typeof rd.text === 'string' ? rd.text : String(rd.text ?? '')
              const speaker = typeof rd.speaker === 'string' ? rd.speaker : String(rd.speaker ?? '')
              const t =
                typeof rd.type === 'string' &&
                (rd.type === 'speech' || rd.type === 'thought' || rd.type === 'narration')
                  ? (rd.type as PanelAssignmentDialogue['type'])
                  : undefined
              return { text, speaker, ...(t ? { type: t } : {}) }
            })
          }
          const sfx = Array.isArray(row.sfx)
            ? ((row.sfx as unknown[]).filter((x) => typeof x === 'string') as string[])
            : undefined
          return {
            pageNumber:
              typeof row.pageNumber === 'number' ? row.pageNumber : Number(row.pageNumber ?? 0),
            content: typeof row.content === 'string' ? row.content : String(row.content ?? ''),
            panelIndex:
              typeof row.panelIndex === 'number' ? row.panelIndex : Number(row.panelIndex ?? 0),
            ...(dialogue ? { dialogue } : {}),
            ...(sfx ? { sfx } : {}),
          }
        }),
      }
    }

    const normalizedPageBreaks = normalizePageBreaksForPanelAssignment(pageBreaks)
    // ===== 新規追加: キャラID -> 名前 解決 (レンダリングでIDが残らないように) =====
    try {
      // script.characters はスキーマ上必須だが空配列の場合は置換不要
      if (script.characters?.length > 0) {
        const { replaceCharacterIdsInPageBreaks } = await import('@/utils/pagebreak-speaker-normalizer')
        const repRes = replaceCharacterIdsInPageBreaks(normalizedPageBreaks, script.characters, { replaceInContent: true })
  logger.info('speaker:ids_replaced', { episodeNumber, ...repRes })
      } else {
  logger.debug('speaker:skip_id_replacement_empty', { episodeNumber })
      }
    } catch (speakerErr) {
      logger.warn('speaker:replacement_failed_continue', {
        episodeNumber,
        error: speakerErr instanceof Error ? speakerErr.message : String(speakerErr),
      })
    }
    // ===== ここまで追加 =====
    let layoutBuilt = buildLayoutFromPageBreaks(normalizedPageBreaks as unknown as PageBreakV2, {
      title: episode.title || `Episode ${episode.episodeNumber}`,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title || undefined,
    })

    // Layout generation completed - log the results
    logger.info('layout:page_breaks_applied', {
      episodeNumber,
      generatedPages: layoutBuilt?.pages?.length || 0,
      scriptPanels: script.panels.length,
    })

    // Basic validation: ensure layout was generated
    if (!layoutBuilt?.pages || layoutBuilt.pages.length === 0) {
      // In demo mode, synthesize a minimal 1-page layout so tests remain offline and deterministic
      if (isDemo) {
        logger.warn('layout:empty_after_build_demo_fallback', {
          episodeNumber,
          scriptPanels: script.panels.length,
        })
        layoutBuilt = {
          title: episode.title || `Episode ${episode.episodeNumber}`,
          created_at: new Date().toISOString(),
          episodeNumber: episode.episodeNumber,
          pages: [
            {
              page_number: 1,
              panels: [
                {
                  id: 1,
                  position: { x: 0, y: 0 },
                  size: { width: 1, height: 1 },
                  content: '',
                  dialogues: [],
                },
              ],
            },
          ],
        }
      } else {
        // Backward-compat log for tests expecting script-conversion failure wording
        logger.error('layout:build_produced_no_pages', {
          episodeNumber,
          scriptPanels: script.panels.length,
        })
        throw new Error('Layout building failed to generate any pages')
      }
    }

    const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
    const normalized = normalizeAndValidateLayout(layoutBuilt, {
      bypassValidation: true,
    })

    // 分布ログ: ページごとのパネル数・空content枚数
    try {
      const summary = normalized.layout.pages.map((p) => ({
        page: p.page_number,
        panels: p.panels.length,
        emptyContent: p.panels.filter((x) => !x.content || x.content.trim().length === 0).length,
      }))
      logger.info('layout:distribution_summary', {
        episodeNumber: episode.episodeNumber,
        pages: summary,
      })
    } catch (summaryError) {
      logger.warn('Failed to generate layout summary', {
        episodeNumber,
        error: (summaryError as Error).message,
      })
    }

    // 保存 + ステータス永続化 (EpisodePort.saveLayout に集約)
    try {
      const { episode: episodePort } = getPorts()
      if (episodePort.saveLayout) {
        const EffectLib = await import('effect')
        await EffectLib.Effect.runPromise(
          episodePort.saveLayout({
            novelId: episode.novelId,
            jobId,
            episodeNumber,
            layoutJson: normalized.layout,
            fullPagesPath: JsonStorageKeys.fullPages({ novelId: episode.novelId, jobId }),
          }),
        )
      } else {
        logger.warn('layout:episode_port_saveLayout_unimplemented', { episodeNumber })
      }
    } catch (storageError) {
      logger.error('layout:saveLayout_failed', {
        episodeNumber,
        error: (storageError as Error).message,
        stack: (storageError as Error).stack,
      })
      throw new Error('saveLayout failed')
    }

    // ステータス更新 (ジョブ進行。レイアウトDB保存は saveLayout 内で完了済み)
    try {
      await jobRepo.markStepCompleted(jobId, 'layout')
      await jobRepo.updateStep(jobId, 'render')
      if (!isDemo && job) {
        dbFactory.jobs().updateProcessingPosition(jobId, { episode: episodeNumber, page: null })
      }
    } catch (statusError) {
      logger.error('layout:job_status_update_failed', {
        episodeNumber,
        error: (statusError as Error).message,
      })
      throw new Error(`Job status update failed: ${(statusError as Error).message}`)
    }

    const storageKey = StorageKeys.episodeLayout({
      novelId: episode.novelId,
      jobId,
      episodeNumber,
    })
    if (!normalized || !normalized.layout || !Array.isArray(normalized.layout.pages)) {
      throw new Error('Layout building failed to generate any pages')
    }
    const pageNumbers = normalized.layout.pages.map((p) => p.page_number).sort((a, b) => a - b)
  logger.info('layout:success', { jobId, episodeNumber, pages: pageNumbers.length })
    return { layout: normalized.layout, storageKey, pageNumbers }
  } catch (scriptFlowError) {
    logger.error('layout:failed', {
      error: (scriptFlowError as Error).message,
      episodeNumber,
      stack: (scriptFlowError as Error).stack,
    })
    throw scriptFlowError
  }
}

// (demoLayoutFromEpisode) was removed: demo mode now uses the normal planning/generation flow

// --- Test hooks (暫定) -----------------------------------------------------
// get-sfx-text.test.ts は、SFXテキスト取得ロジックが generateEpisodeLayout の
// ローカルスコープに閉じており直接呼べない現在仕様を保証するため、
// __testHooks.getSfxText() が呼ばれると特定メッセージで失敗することを期待している。
// 将来 SFX 抽出を独立ステップ化する際にはこの暫定フックを削除し、
// 代わりに正式な Effect ベースの API / サービスに差し替える予定。
export const __testHooks = {
  async getSfxText(): Promise<never> {
    throw new Error('scoped inside generateEpisodeLayout')
  },
}
