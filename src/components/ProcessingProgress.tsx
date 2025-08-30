'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

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

// CONFIGURATION: Progress weight for the current in-flight episode during layout
// This value (0.5) represents the partial completion credit given to an episode
// that is currently being processed. It helps provide more accurate progress
// feedback by giving 50% credit for the episode being worked on, preventing
// the progress bar from appearing stalled during long episode processing.
// Range: 0.0 (no credit) to 1.0 (full credit for in-progress episodes)
const DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT = 0.5 as const

// CONFIGURATION: Maximum number of log entries to keep in memory
// Keeps the last 50 log entries to prevent memory bloat while maintaining
// sufficient history for debugging and user feedback
const MAX_LOG_ENTRIES = 50 as const

// CONFIGURATION: Polling intervals for job status updates
// These values balance responsiveness with server load
const POLLING_INTERVAL_MS: number = 2000 // 2 seconds between status checks
const INITIAL_POLLING_DELAY_MS: number = 1000 // 1 second delay before first poll

// CONFIGURATION: UI layout constants
const MAX_VISIBLE_LOG_HEIGHT = 60 as const // vh units for log container height
const DEFAULT_EPISODE_NUMBER = 1 as const // Fallback episode number when parsing fails

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

  const baseProgress = Math.round((renderedPages / totalPages) * 100)
  const processingPage = job.processingPage

  // 現在処理中のページがある場合は部分的な進捗を追加
  if (typeof processingPage === 'number' && processingPage > 0) {
    return Math.min(90, baseProgress + 10) // 最大90%まで
  }

  return baseProgress
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
  const [showLogs, setShowLogs] = useState(process.env.NODE_ENV === 'development')
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

  // Ref to track component mount state for proper cleanup
  const isMountedRef = useRef(true)
  // AbortController for in-flight fetch to avoid leaks on unmount/reschedule
  const pollAbortRef = useRef<AbortController | null>(null)
  // Pause polling when tab is hidden
  const isPausedRef = useRef<boolean>(false)
  // Recursive timeout driver for polling
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 進捗重み（クランプ）
  const inProgressWeight = useMemo(() => {
    const w =
      typeof currentEpisodeProgressWeight === 'number'
        ? currentEpisodeProgressWeight
        : DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    if (Number.isNaN(w)) return DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    return Math.max(0, Math.min(1, w))
  }, [currentEpisodeProgressWeight])

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
          if (!parsed.success) continue
          const val = parsed.data
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
          if (onComplete) onComplete()
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
          const inFlightPage = data.job.processingPage
          const doneBase = data.job.renderedPages ?? 0
          const done = Math.min(
            total || doneBase + 1,
            typeof inFlightPage === 'number' && inFlightPage > 0 ? inFlightPage : doneBase + 1,
          )
          // より詳細なレンダリング進捗表示
          if (total > 0) {
            const progressPercent = Math.round((done / total) * 100)
            hints.render = `現在: ページ ${done} / ${total} をレンダリング中 (${progressPercent}%)`
          } else {
            hints.render = `現在: ページ ${done} をレンダリング中`
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
      onComplete,
      describeStep,
      isDemoMode,
      inProgressWeight,
      EpisodePageDataSchema.safeParse,
    ],
  )

  useEffect(() => {
    if (!jobId) return

    // 初期状態を設定（一度だけ）
    setSteps((prev) =>
      prev.map((step, index) => (index === 0 ? { ...step, status: 'completed' as const } : step)),
    )
    setOverallProgress(Math.round(STEP_PERCENT))
    addLog('info', `処理を開始しました。Job ID: ${jobId}`)

    // Visibility: pause when hidden
    const onVisibility = () => {
      isPausedRef.current = document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    const scheduleNext = (delay: number) => {
      if (!isMountedRef.current) return
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = setTimeout(runOnce, delay)
    }

    const runOnce = async () => {
      if (!isMountedRef.current) return
      if (isPausedRef.current) {
        scheduleNext(POLLING_INTERVAL_MS * 2)
        return
      }
      if (pollAbortRef.current) pollAbortRef.current.abort()
      const controller = new AbortController()
      pollAbortRef.current = controller
      try {
        const response = await fetch(`/api/jobs/${jobId}/status`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          // 404 NOT_FOUND の場合はジョブが存在しないため、ポーリングを停止
          if (response.status === 404) {
            addLog('error', 'ジョブが見つかりません。ポーリングを停止します。')
            addLog('info', '新しいファイルをアップロードしてジョブを作成してください。')
            return // ポーリング停止
          }
          throw new Error(`API呼び出しに失敗: ${response.status} ${response.statusText}`)
        }
        const data: JobData = await response.json()
        if (!isMountedRef.current) return

        const result = updateStepsFromJobData(data)
        if (result === 'stop') {
          addLog('info', 'ポーリングを停止しました')
          try {
            const statusCompleted =
              data.job.status === 'completed' || data.job.status === 'complete'
            if (data.job.renderCompleted === true || statusCompleted) {
              addLog('info', '処理が完了しました。上部のエクスポートからダウンロードできます。')
              // 念のためここでも onComplete を呼ぶ（UI側の遷移を確実に発火）
              if (onComplete) onComplete()
            } else if (data.job.status === 'failed') {
              const errorStep = data.job.lastErrorStep || data.job.currentStep || '不明'
              const errorMessage = data.job.lastError || 'エラーの詳細が不明です'
              addLog('error', `処理が失敗しました - ${errorStep}: ${errorMessage}`)
              addLog('info', 'エラーが解決しない場合は、新しいファイルで再度お試しください。')
            }
          } catch (e) {
            console.error('post-complete message handling failed', e)
            addLog(
              'error',
              `完了処理メッセージの処理中にエラー: ${e instanceof Error ? e.message : String(e)}`,
            )
          }
          return
        }

        // Adaptive interval based on step
        const step = data.job.currentStep || ''
        let next = POLLING_INTERVAL_MS
        if (step.startsWith('layout') || step.startsWith('analyze'))
          next = POLLING_INTERVAL_MS * 1.5
        if (step.startsWith('render')) next = Math.max(1000, POLLING_INTERVAL_MS * 0.75)
        if (document.hidden) next = POLLING_INTERVAL_MS * 2
        scheduleNext(next)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        if (isMountedRef.current) {
          addLog(
            'error',
            `Job状態の取得に失敗: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        // Back off on error
        scheduleNext(POLLING_INTERVAL_MS * 2)
      }
    }

    // kick-off with initial delay
    const startTimer = setTimeout(() => scheduleNext(0), INITIAL_POLLING_DELAY_MS)

    return () => {
      isMountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(startTimer)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
      if (pollAbortRef.current) pollAbortRef.current.abort()
    }
  }, [jobId, addLog, updateStepsFromJobData, onComplete])

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
            {process.env.NODE_ENV === 'development' && (
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
                              const totalPages = totalPagesByEpisodes
                              const renderedPages = renderedPagesByEpisodes
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
      {process.env.NODE_ENV === 'development' && showLogs && (
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
                  <span className="text-gray-400 font-mono whitespace-nowrap">{log.timestamp}</span>
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
