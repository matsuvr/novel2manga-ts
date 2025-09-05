'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { appConfig } from '@/config/app.config'
import { isRenderCompletelyDone } from '@/utils/completion'
const _MAX_PAGES = appConfig.rendering.limits.maxPages

interface ProcessStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress?: number
  error?: string
}

interface ProcessingProgressProps {
  jobId: string | null
  onComplete?: () => void
  modeHint?: string // テスト/デモなどの実行モード表示
  isDemoMode?: boolean // デモ/テストで分析をスキップする場合
  /**
   * 現在処理中エピソードに付与する進捗配点（0.0〜1.0）。
   * 例: 0.5 -> 処理中エピソードを50%完了として扱う。
   * 指定されない場合はデフォルト値を使用。
   */
  currentEpisodeProgressWeight?: number
}

interface JobData {
  job: {
    status: string
    currentStep: string
    lastError?: string
    lastErrorStep?: string
    splitCompleted?: boolean
    analyzeCompleted?: boolean
    episodeCompleted?: boolean
    layoutCompleted?: boolean
    renderCompleted?: boolean
    processedChunks?: number
    totalChunks?: number
    processedEpisodes?: number
    totalEpisodes?: number
    renderedPages?: number
    totalPages?: number
    processingEpisode?: number
    processingPage?: number
    progress?: {
      perEpisodePages?: Record<
        string,
        {
          planned: number
          rendered: number
          total?: number
          validation?: {
            normalizedPages: number[]
            pagesWithIssueCounts: Record<number, number> | Record<string, number>
            issuesCount: number
          }
        }
      >
    }
  }
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'error' | 'warning'
  message: string
  data?: unknown
}

// UI 関連設定は app.config.ts に一元化
const DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT =
  appConfig.ui.progress.currentEpisodeProgressWeight ?? 0.5
const MAX_LOG_ENTRIES = appConfig.ui.logs.maxEntries
const MAX_VISIBLE_LOG_HEIGHT = appConfig.ui.logs.maxVisibleLogHeightVh
const DEFAULT_EPISODE_NUMBER = appConfig.ui.progress.defaultEpisodeNumber

const INITIAL_STEPS: ProcessStep[] = [
  {
    id: 'upload',
    name: 'アップロード',
    description: 'テキストファイルをアップロード中',
    status: 'pending',
  },
  {
    id: 'split',
    name: 'チャンク分割',
    description: 'テキストを適切なサイズに分割中',
    status: 'pending',
  },
  {
    id: 'analyze',
    name: '要素分析',
    description: '登場人物・シーン・対話を抽出中',
    status: 'pending',
  },
  {
    id: 'episode',
    name: 'エピソード構成',
    description: '物語の流れを分析中',
    status: 'pending',
  },
  {
    id: 'layout',
    name: 'レイアウト生成',
    description: 'マンガのコマ割りを作成中',
    status: 'pending',
  },
  {
    id: 'render',
    name: 'レンダリング',
    description: '絵コンテ画像を生成中',
    status: 'pending',
  },
]

// ステップ1つあたりの全体進捗割合を定数化
const STEP_PERCENT = 100 / (INITIAL_STEPS.length || 1)

// ヘルパー関数: レンダリング進捗の計算
function calculateRenderProgress(job: Record<string, unknown>): number {
  const totalPages = job.totalPages
  const renderedPages = job.renderedPages

  if (typeof totalPages !== 'number' || typeof renderedPages !== 'number') {
    return 0
  }

  if (totalPages === 0) {
    return 0
  }

  // 実際の進捗を正確に反映
  const baseProgress = Math.round((renderedPages / totalPages) * 100)

  // 処理中のページがある場合は、そのページを50%完了として扱う
  const processingPage = job.processingPage
  if (typeof processingPage === 'number' && processingPage > 0 && renderedPages < totalPages) {
    const partialProgress = Math.round((0.5 / totalPages) * 100) // 0.5ページ分の進捗
    return Math.min(99, baseProgress + partialProgress) // 最大99%まで（完了は100%のみ）
  }

  return Math.min(100, baseProgress)
}

// ヘルパー関数: 全体進捗の計算
function calculateOverallProgress(job: Record<string, unknown>, completedCount: number): number {
  const baseProgress = Math.round(completedCount * STEP_PERCENT)

  // レンダリング段階では、実際のページ進捗を全体進捗に反映
  const currentStep = job.currentStep
  if (
    typeof currentStep === 'string' &&
    (currentStep === 'render' || currentStep.startsWith('render_'))
  ) {
    const totalPages = job.totalPages
    const renderedPages = job.renderedPages

    if (typeof totalPages === 'number' && typeof renderedPages === 'number' && totalPages > 0) {
      const renderProgress = (renderedPages / totalPages) * STEP_PERCENT
      return Math.round(baseProgress + renderProgress)
    }
  }

  return baseProgress
}

function ProcessingProgress({
  jobId,
  onComplete,
  modeHint,
  isDemoMode,
  currentEpisodeProgressWeight,
}: ProcessingProgressProps) {
  const [steps, setSteps] = useState<ProcessStep[]>(() =>
    INITIAL_STEPS.map((step) => ({ ...step })),
  )
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [overallProgress, setOverallProgress] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const showLogsFlag =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1') ||
    process.env.NODE_ENV === 'development'
  const [showLogs, setShowLogs] = useState(showLogsFlag)
  const [lastJobData, setLastJobData] = useState<string>('')
  type HintStep = 'split' | 'analyze' | 'layout' | 'render'
  const [runtimeHints, setRuntimeHints] = useState<Partial<Record<HintStep, string>>>({})
  const [perEpisodePages, setPerEpisodePages] = useState<
    Record<
      number,
      {
        planned: number
        rendered: number
        total?: number
        validation?: {
          normalizedPages: number[]
          pagesWithIssueCounts: Record<number, number>
          issuesCount: number
        }
      }
    >
  >({})
  const [currentLayoutEpisode, setCurrentLayoutEpisode] = useState<number | null>(null)
  // DB集計のページ数（SSEのJobDataから反映）。UI表示で優先使用。
  const [dbPageTotals, setDbPageTotals] = useState<{ totalPages: number; renderedPages: number }>({
    totalPages: 0,
    renderedPages: 0,
  })
  // 完了検知を描画外（エフェクト）で実施するためのフラグ
  const [completed, setCompleted] = useState(false)
  // 正規化トースト表示の一回限りフラグ
  const [normalizationToastShown, setNormalizationToastShown] = useState(false)

  // トークン使用量（進行中の概算: 完了済み呼び出しの集計）
  const [tokenPromptSum, setTokenPromptSum] = useState(0)
  const [tokenCompletionSum, setTokenCompletionSum] = useState(0)

  // マウント状態
  const isMountedRef = useRef(true)
  // 直近のジョブスナップショット（厳密完了判定で利用）
  const lastJobRef = useRef<JobData['job'] | null>(null)

  // 進捗重み（クランプ）
  const inProgressWeight = useMemo(() => {
    const w =
      typeof currentEpisodeProgressWeight === 'number'
        ? currentEpisodeProgressWeight
        : DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    if (Number.isNaN(w)) return DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    return Math.max(0, Math.min(1, w))
  }, [currentEpisodeProgressWeight])

  // トークン使用量ポーリング（SSE連携とは独立。完了済み呼び出しの累積を表示）
  useEffect(() => {
    if (!jobId) return
    let timer: NodeJS.Timeout | null = null
    let cancelled = false
    const intervalMs = appConfig.ui.progress.tokenUsagePollIntervalMs
    const fetchUsage = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/token-usage`)
        if (!res.ok) return
        const json = (await res.json()) as {
          tokenUsage?: Array<{ promptTokens: number; completionTokens: number }>
        }
        const rows = Array.isArray(json.tokenUsage) ? json.tokenUsage : []
        if (!cancelled) {
          const p = rows.reduce((s, r) => s + (Number(r.promptTokens) || 0), 0)
          const c = rows.reduce((s, r) => s + (Number(r.completionTokens) || 0), 0)
          setTokenPromptSum(p)
          setTokenCompletionSum(c)
        }
      } catch (e) {
        // 一時的なエラーはUIを止めないが、開発時は警告として出す
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('Failed to fetch token usage:', e)
        }
      }
    }
    fetchUsage()
    timer = setInterval(fetchUsage, intervalMs)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [jobId])

  // Zod による perEpisodePages の要素検証（型安全・簡潔）
  const EpisodePageDataSchema = useMemo(
    () =>
      z.object({
        planned: z.number(),
        rendered: z.number(),
        total: z.number().optional(),
        validation: z
          .object({
            normalizedPages: z.array(z.number()),
            // 数値キーはJSONでは文字列化されるため、record<number>相当も受け入れる
            pagesWithIssueCounts: z.record(z.number()).optional(),
            issuesCount: z.number().optional(),
          })
          .optional(),
      }),
    [],
  )

  // ステップ名から詳細メッセージを生成
  const describeStep = useCallback((stepId: string): string => {
    if (!stepId) return '状態更新'
    const mAnalyze = stepId.match(/^analyze_chunk_(\d+)(?:_(retry|done))?$/)
    if (mAnalyze) {
      const idx = mAnalyze[1]
      const suffix = mAnalyze[2]
      if (suffix === 'retry') return `要素分析: チャンク${idx} をリトライ中`
      if (suffix === 'done') return `要素分析: チャンク${idx} 分析完了`
      return `要素分析: チャンク${idx} を分析中`
    }
    const mLayoutEp = stepId.match(/^layout_episode_(\d+)$/)
    if (mLayoutEp) {
      return `レイアウト生成: エピソード${mLayoutEp[1]} をYAMLに変換中`
    }
    if (stepId.startsWith('layout')) return 'レイアウト生成中'
    if (stepId.startsWith('episode')) return 'エピソード分割中'
    if (stepId.startsWith('split')) return 'チャンク分割中'
    if (stepId.startsWith('render')) return 'レンダリング中'
    return stepId
  }, [])

  const addLog = useCallback(
    (level: 'info' | 'error' | 'warning', message: string, data?: unknown) => {
      const logEntry: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        data,
      }
      setLogs((prev) => {
        // 同じメッセージの連続追加を防ぐ
        const lastLog = prev[prev.length - 1]
        if (lastLog && lastLog.message === message && lastLog.level === level) {
          return prev
        }
        return [...prev.slice(-MAX_LOG_ENTRIES + 1), logEntry]
      })
    },
    [],
  )

  const updateStepsFromJobData = useCallback(
    (data: JobData) => {
      // データが変化していない場合は処理をスキップ
      // 重要: レンダリング中の細かな進捗（processingPage/processingEpisode、perEpisodePagesの変化）も
      // 重複判定に含め、UIが「止まって見える」状態を避ける。
      // perEpisodePages 全体を文字列化すると重くなるため、要約情報（キー数とrendered合計）で検出。
      const perEpisodeSummary = (() => {
        const pep = data.job.progress?.perEpisodePages as
          | Record<string, { planned?: number; rendered?: number; total?: number }>
          | undefined
        if (!pep) return { count: 0, renderedSum: 0, totalSum: 0 }
        let renderedSum = 0
        let totalSum = 0
        const entries = Object.entries(pep)
        for (const [, v] of entries) {
          if (typeof v?.rendered === 'number') renderedSum += v.rendered
          if (typeof v?.total === 'number') totalSum += v.total
        }
        return { count: entries.length, renderedSum, totalSum }
      })()

      const jobDataString = JSON.stringify({
        status: data.job.status,
        currentStep: data.job.currentStep,
        splitCompleted: data.job.splitCompleted,
        analyzeCompleted: data.job.analyzeCompleted,
        episodeCompleted: data.job.episodeCompleted,
        layoutCompleted: data.job.layoutCompleted,
        renderCompleted: data.job.renderCompleted,
        processedChunks: data.job.processedChunks,
        totalChunks: data.job.totalChunks,
        processedEpisodes: data.job.processedEpisodes,
        totalEpisodes: data.job.totalEpisodes,
        renderedPages: data.job.renderedPages,
        totalPages: data.job.totalPages,
        processingEpisode: data.job.processingEpisode,
        processingPage: data.job.processingPage,
        perEpisodeCount: perEpisodeSummary.count,
        perEpisodeRenderedSum: perEpisodeSummary.renderedSum,
        perEpisodeTotalSum: perEpisodeSummary.totalSum,
        lastError: data.job.lastError,
      })

      if (jobDataString === lastJobData) {
        // データに変化がなくても、完了または失敗していれば停止指示を返す
        const totalPages = Number(data.job.totalPages || 0)
        const renderedPages = Number(data.job.renderedPages || 0)
        const fallbackCompleted =
          data.job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
        const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
        const uiCompleted =
          data.job.renderCompleted === true || fallbackCompleted || statusCompleted
        return uiCompleted || data.job.status === 'failed' ? 'stop' : null
      }

      setLastJobData(jobDataString)
      // DB集計値を保持（表示用の最終値として優先）
      setDbPageTotals({
        totalPages: Number(data.job.totalPages || 0),
        renderedPages: Number(data.job.renderedPages || 0),
      })
      // 正規化適用（推定）通知: totalPages が上限に達した場合に一度だけトースト
      const MAX_PAGES = appConfig.rendering.limits.maxPages
      if (
        !normalizationToastShown &&
        typeof data.job.totalPages === 'number' &&
        data.job.totalPages >= MAX_PAGES &&
        (data.job.currentStep === 'render' ||
          String(data.job.currentStep || '').startsWith('render'))
      ) {
        addLog(
          'warning',
          `安全装置: ページ番号の正規化を適用しました（上限 ${MAX_PAGES} ページにキャップ）`,
        )
        setNormalizationToastShown(true)
      }
      // 詳細メッセージ
      addLog('info', describeStep(data.job.currentStep))
      if (data.job.lastError) {
        const where = data.job.lastErrorStep ? describeStep(data.job.lastErrorStep) : '処理'
        addLog('error', `${where}に失敗: ${data.job.lastError}`)
      }

      // per-episode page counts (planned/rendered/total)
      if (data.job.progress?.perEpisodePages) {
        const normalized: Record<
          number,
          {
            planned: number
            rendered: number
            total?: number
            validation?: {
              normalizedPages: number[]
              pagesWithIssueCounts: Record<number, number>
              issuesCount: number
            }
          }
        > = {}
        for (const [k, v] of Object.entries(data.job.progress.perEpisodePages)) {
          const episodeNumber = Number(k)
          if (Number.isNaN(episodeNumber)) continue
          const parsed = EpisodePageDataSchema.safeParse(v)
          let val: z.infer<typeof EpisodePageDataSchema> | null = null
          if (parsed.success) {
            val = parsed.data
          } else if (
            v &&
            typeof v === 'object' &&
            typeof (v as { actualPages?: unknown }).actualPages === 'number' &&
            typeof (v as { rendered?: unknown }).rendered === 'number'
          ) {
            // 後方互換: JobProgressServiceが actualPages を返すケースを許容
            const legacy = v as unknown as {
              actualPages: number
              rendered: number
              validation?: unknown
            }
            val = {
              planned: legacy.actualPages,
              rendered: legacy.rendered,
              total: legacy.actualPages,
              validation: legacy.validation as
                | {
                    normalizedPages: number[]
                    pagesWithIssueCounts: Record<number, number>
                    issuesCount: number
                  }
                | undefined,
            }
          } else {
            continue
          }
          // val はここで必ず非null
          normalized[episodeNumber] = {
            planned: val.planned,
            rendered: val.rendered,
            total: val.total,
            validation: val.validation
              ? {
                  normalizedPages: val.validation.normalizedPages,
                  pagesWithIssueCounts: val.validation.pagesWithIssueCounts || {},
                  issuesCount: val.validation.issuesCount ?? 0,
                }
              : undefined,
          }
        }
        setPerEpisodePages(normalized)
      }

      // 状態を直接更新
      setSteps((prevSteps) => {
        const updatedSteps = prevSteps.map((step) => ({ ...step }))
        let currentIndex = -1
        let completedCount = 0

        // 完了条件
        // 1) レンダリング完了フラグ
        // 2) 念押しフォールバック: job.status が completed かつ renderedPages>=totalPages>0
        // 3) バックエンドが completed を明示した場合（DB集計が未反映でもUIは完了として扱う）
        const totalPages = Number(data.job.totalPages || 0)
        const renderedPages = Number(data.job.renderedPages || 0)
        const fallbackCompleted =
          data.job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
        const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
        const uiCompleted =
          data.job.renderCompleted === true || fallbackCompleted || statusCompleted

        if (uiCompleted) {
          updatedSteps.forEach((step) => {
            step.status = 'completed'
            completedCount++
          })
          addLog('info', '全ての処理が完了しました')
          setCompleted(true)
          return updatedSteps
        } else if (data.job.status === 'failed') {
          const failedStepMap: Record<string, number> = {
            split: 1,
            analyze: 2,
            episode: 3,
            layout: 4,
            render: 5,
          }
          // 正規化: analyze_chunk_*, layout_episode_*, render_* などの派生ステップを親ステップにマップ
          const rawStep = data.job.currentStep || ''
          const normalizedStep = rawStep.startsWith('analyze_')
            ? 'analyze'
            : rawStep.startsWith('layout')
              ? 'layout'
              : rawStep.startsWith('render')
                ? 'render'
                : rawStep.startsWith('episode')
                  ? 'episode'
                  : rawStep
          const failedIndex = failedStepMap[normalizedStep] || 0

          updatedSteps.forEach((step, index) => {
            if (index < failedIndex) {
              step.status = 'completed'
              completedCount++
            } else if (index === failedIndex) {
              step.status = 'error'
              step.error = data.job.lastError
              currentIndex = index
            } else {
              step.status = 'pending'
            }
          })
          addLog('error', `処理が失敗しました: ${data.job.lastError}`)
          return updatedSteps
        } else {
          // Processing state
          updatedSteps[0].status = 'completed' // Upload always complete if job exists
          completedCount++

          if (data.job.splitCompleted) {
            updatedSteps[1].status = 'completed'
            completedCount++
          } else if (
            data.job.currentStep === 'split' ||
            data.job.currentStep === 'chunks_created'
          ) {
            updatedSteps[1].status = 'processing'
            if (data.job.totalChunks && data.job.processedChunks !== undefined) {
              updatedSteps[1].progress = Math.round(
                (data.job.processedChunks / data.job.totalChunks) * 100,
              )
            }
            currentIndex = 1
          }

          if (data.job.analyzeCompleted) {
            updatedSteps[2].status = 'completed'
            completedCount++
          } else if (
            data.job.currentStep === 'analyze' ||
            data.job.currentStep?.startsWith('analyze_')
          ) {
            updatedSteps[2].status = 'processing'
            if (data.job.totalChunks && data.job.processedChunks !== undefined) {
              updatedSteps[2].progress = Math.round(
                (data.job.processedChunks / data.job.totalChunks) * 100,
              )
            }
            currentIndex = 2
          }

          if (data.job.episodeCompleted) {
            updatedSteps[3].status = 'completed'
            completedCount++
          } else if (
            data.job.currentStep === 'episode' ||
            data.job.currentStep?.startsWith('episode_')
          ) {
            updatedSteps[3].status = 'processing'
            // エピソード構成の進捗を表示（processedChunks/totalChunksを流用）
            if (data.job.totalChunks && data.job.processedChunks !== undefined) {
              updatedSteps[3].progress = Math.round(
                (data.job.processedChunks / data.job.totalChunks) * 100,
              )
            }
            currentIndex = 3
          }

          if (data.job.layoutCompleted) {
            updatedSteps[4].status = 'completed'
            completedCount++
          } else if (
            data.job.currentStep === 'layout' ||
            data.job.currentStep?.startsWith('layout_')
          ) {
            updatedSteps[4].status = 'processing'
            // エピソード単位でのレイアウト進捗を表示
            if (data.job.totalEpisodes && data.job.processedEpisodes !== undefined) {
              // 現在処理中のエピソード番号を取得
              const currentEpisodeMatch = data.job.currentStep?.match(/layout_episode_(\d+)/)
              const currentEpisodeNum = currentEpisodeMatch
                ? parseInt(currentEpisodeMatch[1], 10)
                : DEFAULT_EPISODE_NUMBER

              // 進捗計算：完了したエピソード数 + 現在のエピソードの進捗（0.5とする）
              const processedWithCurrent =
                data.job.processedEpisodes +
                (currentEpisodeNum > data.job.processedEpisodes ? inProgressWeight : 0)
              updatedSteps[4].progress = Math.round(
                (processedWithCurrent / data.job.totalEpisodes) * 100,
              )
            }
            currentIndex = 4
          }

          if (data.job.renderCompleted || fallbackCompleted) {
            updatedSteps[5].status = 'completed'
            completedCount++
          } else if (
            data.job.currentStep === 'render' ||
            data.job.currentStep?.startsWith('render_')
          ) {
            updatedSteps[5].status = 'processing'
            // レンダリング進捗の計算
            updatedSteps[5].progress = calculateRenderProgress(data.job)
            currentIndex = 5
          }
        }

        // ステータス遷移に基づくログ（差分を検知）
        for (let i = 0; i < updatedSteps.length; i++) {
          const before = prevSteps[i]
          const after = updatedSteps[i]
          if (before.status !== after.status) {
            if (after.status === 'processing') {
              addLog('info', `${after.name} を開始しました`)
            } else if (after.status === 'completed') {
              // デモ/テストで分析やエピソード構成をスキップした場合は明示
              if (isDemoMode && (after.id === 'analyze' || after.id === 'episode')) {
                addLog('info', `デモ: ${after.name} をスキップ（仮完了）しました`)
              } else {
                addLog('info', `${after.name} が完了しました`)
              }
            } else if (after.status === 'error') {
              addLog('error', `${after.name} でエラーが発生しました`)
            }
          }
        }

        // ステップごとの動的メッセージ（現在どこを処理中か）
        const hints: Record<string, string> = {}
        const stepId = data.job.currentStep || ''
        const analyzeMatch = stepId.match(/^analyze_chunk_(\d+)(?:_(retry|done))?$/)
        if (analyzeMatch && !data.job.analyzeCompleted) {
          const idx = Number(analyzeMatch[1])
          const total = data.job.totalChunks || 0
          hints.analyze = `現在: チャンク ${Math.min(idx + 1, total || idx + 1)} / ${total || '?'} を分析中`
        } else if (
          (stepId === 'analyze' || stepId.startsWith('analyze_')) &&
          !data.job.analyzeCompleted
        ) {
          const done = (data.job.processedChunks ?? 0) + 1
          const total = data.job.totalChunks || 0
          hints.analyze = `現在: チャンク ${Math.min(done, total || done)} / ${total || '?'} を分析中`
        }
        if ((stepId === 'split' || stepId === 'chunks_created') && !data.job.splitCompleted) {
          const done = (data.job.processedChunks ?? 0) + 1
          const total = data.job.totalChunks || 0
          hints.split = `現在: チャンク ${Math.min(done, total || done)} / ${total || '?'} を作成中`
        }
        if ((stepId === 'episode' || stepId.startsWith('episode_')) && !data.job.episodeCompleted) {
          const processedChunks = data.job.processedChunks ?? 0
          const totalChunks = data.job.totalChunks || 4
          const progressSteps = [
            '統合スクリプト読み込み',
            'エピソード切れ目検出',
            'エピソードデータ保存',
            '完了処理',
          ]
          const currentStepName = progressSteps[Math.min(processedChunks, progressSteps.length - 1)]
          hints.episode = `現在: ${currentStepName}中 (${processedChunks}/${totalChunks})`

          // デバッグ情報をログに追加（環境フラグで制御）
          if (
            (typeof process !== 'undefined' &&
              process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1') ||
            process.env.NODE_ENV === 'development'
          ) {
            addLog(
              'info',
              `エピソード構成進捗: ${processedChunks}/${totalChunks} - ${currentStepName}`,
            )
          }
        }
        const layoutMatch = stepId.match(/^layout_episode_(\d+)$/)
        if (layoutMatch && !data.job.layoutCompleted) {
          const ep = Number(layoutMatch[1])
          setCurrentLayoutEpisode(ep)
          const totalEp = data.job.totalEpisodes || 0
          hints.layout = `現在: エピソード ${Math.min(ep, totalEp || ep)} / ${totalEp || '?'} をレイアウト中`
        } else if (
          (stepId === 'layout' || stepId.startsWith('layout_')) &&
          !data.job.layoutCompleted
        ) {
          const processedEp = data.job.processedEpisodes || 0
          const totalEp = data.job.totalEpisodes || 0
          hints.layout = `現在: エピソード ${processedEp + 1} / ${totalEp || '?'} をレイアウト中`
        }
        if ((stepId === 'render' || stepId.startsWith('render_')) && !data.job.renderCompleted) {
          const total = data.job.totalPages || 0
          const rendered = data.job.renderedPages ?? 0
          const processingPage = data.job.processingPage
          const processingEpisode = data.job.processingEpisode

          // より詳細なレンダリング進捗表示
          if (total > 0) {
            const progressPercent = Math.round((rendered / total) * 100)
            if (processingPage && processingEpisode) {
              hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中 (${rendered}/${total}完了 ${progressPercent}%)`
            } else {
              hints.render = `現在: ${rendered}/${total}ページ完了 (${progressPercent}%)`
            }
          } else {
            if (processingPage && processingEpisode) {
              hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中`
            } else {
              hints.render = `現在: ${rendered}ページ完了`
            }
          }
        }
        setRuntimeHints(hints)

        // 現在のインデックスと進捗を設定
        setCurrentStepIndex(currentIndex)

        // 全体進捗の計算
        const overallProgressPercent = calculateOverallProgress(data.job, completedCount)
        setOverallProgress(overallProgressPercent)

        return updatedSteps
      })

      // 完了または失敗でポーリング停止
      const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
      // Stop polling when job is definitively completed or failed.
      return statusCompleted || data.job.status === 'failed' ? 'stop' : 'continue'
    },
    [
      lastJobData,
      addLog,
      describeStep,
      isDemoMode,
      inProgressWeight,
      EpisodePageDataSchema.safeParse,
      normalizationToastShown,
    ],
  )

  useEffect(() => {
    if (!jobId) return

    // 初期状態（アップロード完了）
    setSteps((prev) =>
      prev.map((step, index) => (index === 0 ? { ...step, status: 'completed' as const } : step)),
    )
    setOverallProgress(Math.round(STEP_PERCENT))
    addLog('info', `処理を開始しました。Job ID: ${jobId}`)

    // TODO(#128): 現状はSSE + サーバ側軽量ポーリングで進捗更新。
    // 今後はPub/Sub(例: Redis Pub/Sub, Cloudflare Pub/Sub)を用いて
    // ワーカーがpublish、本UIはSSE経由でsubscribeしpush配信に切替える。
    const es = new EventSource(`/api/jobs/${jobId}/events`)

    const handlePayload = (raw: string) => {
      try {
        const data = JSON.parse(raw) as JobData
        // 直近ジョブのスナップショットを保持（厳密な完了判定で使用）
        lastJobRef.current = data.job
        const result = updateStepsFromJobData(data)
        if (result === 'stop') {
          const completed = data.job.status === 'completed' || data.job.status === 'complete'
          if (completed || data.job.renderCompleted === true) {
            addLog('info', '処理が完了しました。上部のエクスポートからダウンロードできます。')
            setCompleted(true)
          } else if (data.job.status === 'failed') {
            const errorStep = data.job.lastErrorStep || data.job.currentStep || '不明'
            const errorMessage = data.job.lastError || 'エラーの詳細が不明です'
            addLog('error', `処理が失敗しました - ${errorStep}: ${errorMessage}`)
          }
        }
      } catch (e) {
        addLog('error', `SSEデータの解析に失敗: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    es.addEventListener('init', (ev) => handlePayload((ev as MessageEvent).data))
    es.addEventListener('message', (ev) => handlePayload((ev as MessageEvent).data))
    es.addEventListener('final', (ev) => handlePayload((ev as MessageEvent).data))
    es.addEventListener('ping', () => {
      // keep-alive: UIには表示しない
    })
    es.addEventListener('error', (ev) => {
      // EventSource は自動再接続する。ユーザー向けに簡潔に記録。
      addLog('warning', 'SSE接続に問題が発生しました。再接続を試行します。', ev)
    })

    return () => {
      isMountedRef.current = false
      es.close()
    }
  }, [jobId, addLog, updateStepsFromJobData])

  // 画面更新（render）の外でのみルーター更新を行う
  useEffect(() => {
    if (!completed) return
    // Allow route transition only after strict completion (page count matches)
    if (!isRenderCompletelyDone(lastJobRef.current)) return
    // onComplete内でのrouter操作はここから呼ぶことで、
    // 「別コンポーネントのレンダー中にsetStateする」警告を回避
    onComplete?.()
  }, [completed, onComplete])

  // jobIdが未確定でも進捗カードを表示（初期段階からUX向上）
  useEffect(() => {
    if (jobId) return
    setSteps((prev) => {
      const updated = prev.map((s) => ({ ...s }))
      updated[0].status = 'processing'
      return updated
    })
    setOverallProgress(0)
    addLog('info', '準備中: アップロードを開始しています')
  }, [jobId, addLog])

  // perEpisodePages に依存する合計ページ数・描画済みページ数をメモ化
  const { totalPagesByEpisodes, renderedPagesByEpisodes } = useMemo(() => {
    const values = Object.values(perEpisodePages)
    if (values.length === 0) return { totalPagesByEpisodes: 0, renderedPagesByEpisodes: 0 }
    const total = values.reduce(
      (sum, ep) => sum + (typeof ep.total === 'number' ? ep.total : ep.planned),
      0,
    )
    const rendered = values.reduce((sum, ep) => sum + ep.rendered, 0)
    return { totalPagesByEpisodes: total, renderedPagesByEpisodes: rendered }
  }, [perEpisodePages])

  // Memoize heavy computation for episode progress cards
  const episodeProgressCards = useMemo(() => {
    return Object.entries(perEpisodePages)
      .map(([epStr, v]) => {
        const ep = Number(epStr)
        const planned = v.planned ?? 0
        const rendered = v.rendered ?? 0
        const total = v.total
        const normalizedPages = v.validation?.normalizedPages || []
        const normalizedCount = normalizedPages.length
        const isCompleted =
          typeof total === 'number' && total > 0 && planned >= total && rendered >= total
        const isCurrent = currentLayoutEpisode === ep
        const isInProgress = !isCompleted && planned > 0
        return {
          ep,
          planned,
          rendered,
          total,
          normalizedCount,
          normalizedPages,
          isCompleted,
          isCurrent,
          isInProgress,
        }
      })
      .sort((a, b) => {
        const score = (x: { isCurrent: boolean; isInProgress: boolean; isCompleted: boolean }) =>
          x.isCurrent ? 0 : x.isInProgress ? 1 : x.isCompleted ? 3 : 2
        const sa = score(a)
        const sb = score(b)
        if (sa !== sb) return sa - sb
        return a.ep - b.ep
      })
  }, [perEpisodePages, currentLayoutEpisode])

  // Check if any step has error status to show error banner
  const hasFailedStep = steps.some((step) => step.status === 'error')
  const failedStep = steps.find((step) => step.status === 'error')

  return (
    <div className="space-y-6">
      {normalizationToastShown && (
        <div className="fixed top-20 right-6 z-40">
          <div className="px-4 py-2 rounded-xl shadow bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
            安全装置: ページ番号の正規化を適用しました（上限 {appConfig.rendering.limits.maxPages}{' '}
            ページ）
          </div>
        </div>
      )}
      {hasFailedStep && failedStep && (
        <div className="apple-card p-4 bg-red-50 border-red-200 border-2">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-red-800 mb-1">処理が失敗しました</h4>
              <p className="text-red-700 text-sm mb-2">{failedStep.name}でエラーが発生しました。</p>
              {failedStep.error && (
                <div className="bg-red-100 border border-red-300 rounded p-3 text-sm text-red-800">
                  <strong>エラー詳細:</strong> {failedStep.error}
                </div>
              )}
              <p className="text-red-600 text-xs mt-2">
                問題が解決しない場合は、新しいファイルで再度お試しください。
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="apple-card p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-semibold gradient-text">処理進捗</h3>
            {typeof process !== 'undefined' &&
              (process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1' ||
                process.env.NODE_ENV === 'development') && (
                <button
                  type="button"
                  onClick={() => setShowLogs(!showLogs)}
                  className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                >
                  {showLogs ? '🔽 ログを隠す' : '▶️ ログを表示'}
                </button>
              )}
          </div>
          {modeHint && (
            <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              {modeHint}
            </div>
          )}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>全体進捗</span>
            <span className="font-medium">{Math.round(overallProgress)}%</span>
          </div>
          <div className="mt-2 h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 shadow-sm"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* 現在のトークン消費（完了済み呼び出しの累積） */}
        {jobId && (
          <div className="apple-card p-4">
            <div className="text-sm text-gray-600">
              現在 入力 {tokenPromptSum.toLocaleString()} トークン / 出力{' '}
              {tokenCompletionSum.toLocaleString()} トークン 消費中…
            </div>
          </div>
        )}

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-start space-x-4 transition-all duration-300 ${
                index === currentStepIndex ? 'scale-[1.02]' : ''
              }`}
            >
              {/* Step indicator */}
              <div className="flex-shrink-0 mt-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    step.status === 'completed'
                      ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                      : step.status === 'processing'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 animate-pulse'
                        : step.status === 'error'
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                          : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step.status === 'completed' ? (
                    '✓'
                  ) : step.status === 'processing' ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : step.status === 'error' ? (
                    '✕'
                  ) : (
                    index + 1
                  )}
                </div>
              </div>

              {/* Step content */}
              <div className="flex-1">
                <h4
                  className={`font-medium ${
                    step.status === 'completed'
                      ? 'text-green-600'
                      : step.status === 'processing'
                        ? 'text-blue-600'
                        : step.status === 'error'
                          ? 'text-red-600'
                          : 'text-gray-400'
                  }`}
                >
                  {step.name}
                </h4>
                <p className="text-sm text-gray-500 mt-1">{step.description}</p>
                {step.status === 'processing' &&
                  (() => {
                    const isHintStep = (s: string): s is HintStep =>
                      s === 'split' || s === 'analyze' || s === 'layout' || s === 'render'
                    if (isHintStep(step.id) && runtimeHints[step.id]) {
                      return <p className="text-sm text-blue-600 mt-1">{runtimeHints[step.id]}</p>
                    }
                    return null
                  })()}

                {step.status === 'processing' && step.progress !== undefined && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>進捗</span>
                      <span>{step.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300"
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                    {/* レンダリング段階では詳細なページ情報を表示 */}
                    {step.id === 'render' && jobId && (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="flex items-center justify-between">
                          <span>レンダリング詳細:</span>
                          <span>
                            {(() => {
                              // データベースから直接取得した値を優先
                              const dbTotalPages = dbPageTotals.totalPages || 0
                              const dbRenderedPages = dbPageTotals.renderedPages || 0
                              const episodeTotalPages = totalPagesByEpisodes
                              const episodeRenderedPages = renderedPagesByEpisodes

                              // より正確な値を使用
                              const totalPages = Math.max(dbTotalPages, episodeTotalPages)
                              const renderedPages = Math.max(dbRenderedPages, episodeRenderedPages)

                              if (totalPages > 0) {
                                const progressPercent = Math.round(
                                  (renderedPages / totalPages) * 100,
                                )
                                return `${renderedPages} / ${totalPages} ページ完了 (${progressPercent}%)`
                              }
                              return `${renderedPages} ページ完了`
                            })()}
                          </span>
                        </div>
                        {/* エピソード別の詳細進捗 */}
                        {Object.keys(perEpisodePages).length > 0 && (
                          <div className="mt-1 text-xs text-gray-500">
                            {Object.entries(perEpisodePages).map(([ep, data]) => (
                              <span key={ep} className="mr-2">
                                EP{ep}: {data.rendered}/{data.total || data.planned}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {step.status === 'error' && step.error && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600 font-medium">エラー:</p>
                    <p className="text-xs text-red-500 mt-1">{step.error}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* エピソード別ページ進捗 */}
      {Object.keys(perEpisodePages).length > 0 && (
        <div className="apple-card p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">エピソード進捗</h4>
          <div className="flex flex-wrap gap-2">
            {episodeProgressCards.map(
              ({
                ep,
                planned,
                rendered,
                total,
                normalizedCount,
                normalizedPages,
                isCompleted,
                isCurrent,
              }) => {
                const plannedPct =
                  typeof total === 'number' && total > 0
                    ? Math.min(100, Math.round((planned / total) * 100))
                    : undefined
                const renderedPct =
                  typeof total === 'number' && total > 0
                    ? Math.min(100, Math.round((rendered / total) * 100))
                    : undefined
                return (
                  <div
                    key={ep}
                    className={
                      `px-3 py-2 rounded-xl border text-xs ` +
                      (isCompleted
                        ? 'bg-gray-50 border-gray-200 text-gray-500'
                        : isCurrent
                          ? 'bg-blue-50 border-blue-200 text-blue-800'
                          : 'bg-gray-50 border-gray-200 text-gray-700')
                    }
                    title={`EP${ep}: planned=${planned}, rendered=${rendered}${
                      typeof total === 'number' ? `, total=${total}` : ''
                    }${normalizedCount > 0 ? `, normalized=${normalizedCount} [pages: ${normalizedPages.join(',')}]` : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-semibold ${isCurrent ? 'text-blue-700' : ''}`}
                      >
                        EP{ep}
                      </span>
                      <span className="text-[11px]">
                        {planned}
                        {typeof total === 'number' ? `/${total}` : ''} 計画, {rendered} 描画
                      </span>
                      {normalizedCount > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                          Normalized {normalizedCount}
                        </span>
                      )}
                    </div>
                    {typeof total === 'number' && total > 0 && (
                      <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full relative overflow-hidden">
                        {/* planned */}
                        <div
                          className={`absolute left-0 top-0 h-full ${isCompleted ? 'bg-green-400' : 'bg-blue-400'}`}
                          style={{ width: `${plannedPct}%` }}
                        />
                        {/* rendered overlay */}
                        <div
                          className="absolute left-0 top-0 h-full bg-green-500/80"
                          style={{ width: `${renderedPct ?? 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              },
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-600">
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded bg-blue-400" />
              <span>計画済みページ</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded bg-green-500" />
              <span>描画済みページ</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded bg-yellow-500" />
              <span>Normalized（自動補正/参照適用）</span>
            </div>
          </div>
        </div>
      )}

      {/* 開発環境でのログ表示 */}
      {typeof process !== 'undefined' &&
        (process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1' ||
          process.env.NODE_ENV === 'development') &&
        showLogs && (
          <div className="apple-card p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
              開発ログ ({logs.length}/{MAX_LOG_ENTRIES})
            </h4>
            <div
              className="space-y-1 overflow-y-auto text-xs"
              style={{ maxHeight: `${MAX_VISIBLE_LOG_HEIGHT}vh` }}
            >
              {logs.length === 0 ? (
                <p className="text-gray-500 italic">ログはまだありません</p>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={`${log.timestamp}-${index}`}
                    className={`flex items-start space-x-2 py-1 px-2 rounded ${
                      log.level === 'error'
                        ? 'bg-red-50 text-red-700'
                        : log.level === 'warning'
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    <span className="text-gray-400 font-mono whitespace-nowrap">
                      {log.timestamp}
                    </span>
                    <span
                      className={`uppercase text-xs font-bold ${
                        log.level === 'error'
                          ? 'text-red-500'
                          : log.level === 'warning'
                            ? 'text-yellow-500'
                            : 'text-blue-500'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="flex-1">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
    </div>
  )
}

export default memo(ProcessingProgress)
