'use client'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { CheckCircle2, Hourglass, XCircle } from '@/components/icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { appConfig } from '@/config/app.config'

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
  modeHint?: string
  isDemoMode?: boolean
  currentEpisodeProgressWeight?: number
}

// Episode page schema and inferred type (module-scope so it can be reused)
const EpisodePageDataSchema = z.object({
  planned: z.number(),
  rendered: z.number(),
  total: z.number().optional(),
  validation: z
    .object({
      normalizedPages: z.array(z.number()),
      pagesWithIssueCounts: z.record(z.number()).optional(),
      issuesCount: z.number().optional(),
    })
    .optional(),
})

type EpisodePageData = z.infer<typeof EpisodePageDataSchema>

interface Job {
  status?: string
  currentStep?: string
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
    perEpisodePages?: Record<string, EpisodePageData>
  }
}

interface JobData {
  job: Job
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'error' | 'warning'
  message: string
  data?: unknown
  id: number
}

const DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT =
  appConfig.ui.progress.currentEpisodeProgressWeight ?? 0.5
const MAX_LOG_ENTRIES = appConfig.ui.logs.maxEntries
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
  { id: 'episode', name: 'エピソード構成', description: '物語の流れを分析中', status: 'pending' },
  {
    id: 'layout',
    name: 'レイアウト生成',
    description: 'マンガのコマ割りを作成中',
    status: 'pending',
  },
  { id: 'render', name: 'レンダリング', description: '絵コンテ画像を生成中', status: 'pending' },
]

const STEP_PERCENT = 100 / (INITIAL_STEPS.length || 1)

export function calculateRenderProgress(job: Job | Record<string, unknown>): number {
  // job may be a Job with typed fields or a looser record (for backwards compatibility)
  const jr = job as Record<string, unknown>
  const totalPages = jr.totalPages
  const renderedPages = jr.renderedPages
  if (typeof totalPages !== 'number' || typeof renderedPages !== 'number' || totalPages === 0) {
    return 0
  }
  const baseProgress = Math.round((renderedPages / totalPages) * 100)
  const processingPage = jr.processingPage
  if (typeof processingPage === 'number' && processingPage > 0 && renderedPages < totalPages) {
    const partialProgress = Math.round((0.5 / totalPages) * 100)
    return Math.min(99, baseProgress + partialProgress)
  }
  return Math.min(100, baseProgress)
}

export function calculateOverallProgress(
  job: Job | Record<string, unknown>,
  completedCount: number,
): number {
  const baseProgress = Math.round(completedCount * STEP_PERCENT)
  const jr = job as Record<string, unknown>
  const currentStep = jr.currentStep
  if (
    typeof currentStep === 'string' &&
    (currentStep === 'render' || currentStep.startsWith('render_'))
  ) {
    const totalPages = jr.totalPages
    const renderedPages = jr.renderedPages
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
  const [activeStep, setActiveStep] = useState(-1)
  const [overallProgress, setOverallProgress] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const showLogsFlag =
    process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1' || process.env.NODE_ENV === 'development'
  const [showLogs, setShowLogs] = useState(showLogsFlag)
  const [lastJobData, setLastJobData] = useState<string>('')
  const logCounterRef = useRef(0)
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
  const [completed, setCompleted] = useState(false)
  const [normalizationToastShown, setNormalizationToastShown] = useState(false)
  const [tokenPromptSum, setTokenPromptSum] = useState(0)
  const [tokenCompletionSum, setTokenCompletionSum] = useState(0)
  const [sseConnected, setSseConnected] = useState(true)
  const isMountedRef = useRef(true)
  const lastJobRef = useRef<JobData['job'] | null>(null)

  const inProgressWeight = useMemo(() => {
    const w =
      typeof currentEpisodeProgressWeight === 'number'
        ? currentEpisodeProgressWeight
        : DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    if (Number.isNaN(w)) return DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    return Math.max(0, Math.min(1, w))
  }, [currentEpisodeProgressWeight])

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
        if (process.env.NODE_ENV !== 'production') {
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
    if (mLayoutEp) return `レイアウト生成: エピソード${mLayoutEp[1]} をYAMLに変換中`
    if (stepId.startsWith('layout')) return 'レイアウト生成中'
    if (stepId.startsWith('episode')) return 'エピソード分割中'
    if (stepId.startsWith('split')) return 'チャンク分割中'
    if (stepId.startsWith('render')) return 'レンダリング中'
    return stepId
  }, [])

  const addLog = useCallback(
    (level: 'info' | 'error' | 'warning', message: string, data?: unknown) => {
      const id = logCounterRef.current++
      const logEntry: LogEntry = {
        id,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        data,
      }
      setLogs((prev) => {
        const lastLog = prev[prev.length - 1]
        if (lastLog && lastLog.message === message && lastLog.level === level) return prev
        return [...prev.slice(-MAX_LOG_ENTRIES + 1), logEntry]
      })
    },
    [],
  )

  const updateStepsFromJobData = useCallback(
    (data: JobData) => {
      const perEpisodeSummary = (() => {
        const pep = data.job.progress?.perEpisodePages as
          | Record<string, { planned?: number; rendered?: number; total?: number }>
          | undefined
        if (!pep) return { count: 0, renderedSum: 0, totalSum: 0 }
        let renderedSum = 0,
          totalSum = 0
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
        const totalPages = Number(data.job.totalPages || 0),
          renderedPages = Number(data.job.renderedPages || 0)
        const fallbackCompleted =
          data.job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
        const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
        const uiCompleted =
          data.job.renderCompleted === true || fallbackCompleted || statusCompleted
        return uiCompleted || data.job.status === 'failed' ? 'stop' : null
      }

      setLastJobData(jobDataString)

      if (
        !normalizationToastShown &&
        typeof data.job.totalPages === 'number' &&
        data.job.totalPages >= _MAX_PAGES &&
        (data.job.currentStep === 'render' ||
          String(data.job.currentStep || '').startsWith('render'))
      ) {
        addLog(
          'warning',
          `安全装置: ページ番号の正規化を適用しました（上限 ${_MAX_PAGES} ページにキャップ）`,
        )
        setNormalizationToastShown(true)
      }
      addLog('info', describeStep(data.job.currentStep ?? ''))
      if (data.job.lastError) {
        const where = data.job.lastErrorStep ? describeStep(data.job.lastErrorStep) : '処理'
        addLog('error', `${where}に失敗: ${data.job.lastError}`)
      }

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
            const legacy = v as unknown as {
              actualPages: number
              rendered: number
              validation?: unknown
            }
            // Narrow validation to the expected shape if possible
            const legacyValidation = legacy.validation
            const validationNormalized =
              legacyValidation && typeof legacyValidation === 'object'
                ? (legacyValidation as {
                    normalizedPages?: number[]
                    pagesWithIssueCounts?: Record<number, number> | Record<string, number>
                    issuesCount?: number
                  })
                : undefined
            val = {
              planned: legacy.actualPages,
              rendered: legacy.rendered,
              total: legacy.actualPages,
              validation: validationNormalized
                ? {
                    normalizedPages: Array.isArray(validationNormalized.normalizedPages)
                      ? validationNormalized.normalizedPages.map((n) => Number(n))
                      : [],
                    pagesWithIssueCounts:
                      (validationNormalized.pagesWithIssueCounts as Record<number, number>) || {},
                    issuesCount: Number(validationNormalized.issuesCount) || 0,
                  }
                : undefined,
            }
          } else continue
          normalized[episodeNumber] = {
            ...val,
            validation: val.validation
              ? {
                  ...val.validation,
                  pagesWithIssueCounts: val.validation.pagesWithIssueCounts || {},
                  issuesCount: val.validation.issuesCount ?? 0,
                }
              : undefined,
          }
        }
        setPerEpisodePages(normalized)
      }

      setSteps((prevSteps) => {
        const updatedSteps = prevSteps.map((step) => ({ ...step }))
        let newActiveStep = -1
        let completedCount = 0

        const totalPages = Number(data.job.totalPages || 0),
          renderedPages = Number(data.job.renderedPages || 0)
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
          setActiveStep(INITIAL_STEPS.length)
          return updatedSteps
        } else if (data.job.status === 'failed') {
          const failedStepMap: Record<string, number> = {
            split: 1,
            analyze: 2,
            episode: 3,
            layout: 4,
            render: 5,
          }
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
              newActiveStep = index
            } else step.status = 'pending'
          })
          addLog('error', `処理が失敗しました: ${data.job.lastError}`)
          setActiveStep(newActiveStep)
          return updatedSteps
        } else {
          updatedSteps[0].status = 'completed'
          completedCount++
          const stepChecks = [
            {
              flag: data.job.splitCompleted,
              processing: ['split', 'chunks_created'],
              index: 1,
              progressKey: 'processedChunks',
              totalKey: 'totalChunks',
            },
            {
              flag: data.job.analyzeCompleted,
              processing: ['analyze', 'analyze_'],
              index: 2,
              progressKey: 'processedChunks',
              totalKey: 'totalChunks',
            },
            {
              flag: data.job.episodeCompleted,
              processing: ['episode', 'episode_'],
              index: 3,
              progressKey: 'processedChunks',
              totalKey: 'totalChunks',
            },
            {
              flag: data.job.layoutCompleted,
              processing: ['layout', 'layout_'],
              index: 4,
              progressKey: 'processedEpisodes',
              totalKey: 'totalEpisodes',
            },
            {
              flag: data.job.renderCompleted,
              processing: ['render', 'render_'],
              index: 5,
              progressKey: 'renderedPages',
              totalKey: 'totalPages',
            },
          ]

          let foundProcessing = false
          for (const check of stepChecks) {
            if (foundProcessing) {
              updatedSteps[check.index].status = 'pending'
              continue
            }
            if (check.flag) {
              updatedSteps[check.index].status = 'completed'
              completedCount++
            } else if (check.processing.some((p) => data.job.currentStep?.startsWith(p))) {
              updatedSteps[check.index].status = 'processing'
              if (check.index === 4) {
                // layout step
                const total = data.job.totalEpisodes || 0,
                  processed = data.job.processedEpisodes || 0
                const match = data.job.currentStep?.match(/layout_episode_(\d+)/)
                const currentNum = match ? parseInt(match[1], 10) : DEFAULT_EPISODE_NUMBER
                const processedWithCurrent =
                  processed + (currentNum > processed ? inProgressWeight : 0)
                updatedSteps[check.index].progress =
                  total > 0 ? Math.round((processedWithCurrent / total) * 100) : 0
              } else if (check.index === 5) {
                // render step
                // calculateRenderProgress expects a Record-like shape; cast safely
                updatedSteps[check.index].progress = calculateRenderProgress(
                  data.job as unknown as Record<string, unknown>,
                )
              } else {
                // Safely index job fields using Record<string, unknown> and runtime checks
                const jobRecord = data.job as Record<string, unknown>
                const total = jobRecord[check.totalKey]
                const processed = jobRecord[check.progressKey]
                if (typeof total === 'number' && typeof processed === 'number' && total > 0) {
                  updatedSteps[check.index].progress = Math.round((processed / total) * 100)
                }
              }
              newActiveStep = check.index
              foundProcessing = true
            }
          }
          if (!foundProcessing) newActiveStep = completedCount
          setActiveStep(newActiveStep)
        }

        for (let i = 0; i < updatedSteps.length; i++) {
          if (prevSteps[i].status !== updatedSteps[i].status) {
            if (updatedSteps[i].status === 'processing')
              addLog('info', `${updatedSteps[i].name} を開始しました`)
            else if (updatedSteps[i].status === 'completed') {
              if (
                isDemoMode &&
                (updatedSteps[i].id === 'analyze' || updatedSteps[i].id === 'episode')
              )
                addLog('info', `デモ: ${updatedSteps[i].name} をスキップ（仮完了）しました`)
              else addLog('info', `${updatedSteps[i].name} が完了しました`)
            } else if (updatedSteps[i].status === 'error')
              addLog('error', `${updatedSteps[i].name} でエラーが発生しました`)
          }
        }

        const hints: Partial<Record<HintStep, string>> = {}
        const stepId = data.job.currentStep || ''
        const analyzeMatch = stepId.match(/^analyze_chunk_(\d+)(?:_(retry|done))?$/)
        if (analyzeMatch && !data.job.analyzeCompleted) {
          const idx = Number(analyzeMatch[1]),
            total = data.job.totalChunks || 0
          hints.analyze = `現在: チャンク ${Math.min(idx + 1, total || idx + 1)} / ${total || '?'} を分析中`
        }
        const layoutMatch = stepId.match(/^layout_episode_(\d+)$/)
        if (layoutMatch && !data.job.layoutCompleted) {
          const ep = Number(layoutMatch[1])
          setCurrentLayoutEpisode(ep)
          const totalEp = data.job.totalEpisodes || 0
          hints.layout = `現在: エピソード ${Math.min(ep, totalEp || ep)} / ${totalEp || '?'} をレイアウト中`
        }
        if ((stepId === 'render' || stepId.startsWith('render_')) && !data.job.renderCompleted) {
          const total = data.job.totalPages || 0,
            rendered = data.job.renderedPages ?? 0
          const processingPage = data.job.processingPage,
            processingEpisode = data.job.processingEpisode
          if (total > 0) {
            const progressPercent = Math.round((rendered / total) * 100)
            if (processingPage && processingEpisode)
              hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中 (${rendered}/${total}完了 ${progressPercent}%)`
            else hints.render = `現在: ${rendered}/${total}ページ完了 (${progressPercent}%)`
          } else {
            if (processingPage && processingEpisode)
              hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中`
            else hints.render = `現在: ${rendered}ページ完了`
          }
        }
        setRuntimeHints(hints)
        setOverallProgress(
          calculateOverallProgress(data.job as unknown as Record<string, unknown>, completedCount),
        )
        return updatedSteps
      })

      const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
      return statusCompleted || data.job.status === 'failed' ? 'stop' : 'continue'
    },
    [lastJobData, addLog, describeStep, isDemoMode, inProgressWeight, normalizationToastShown],
  )

  useEffect(() => {
    if (!jobId) return
    setSteps((prev) =>
      prev.map((step, index) => (index === 0 ? { ...step, status: 'completed' as const } : step)),
    )
    setOverallProgress(Math.round(STEP_PERCENT))
    setActiveStep(1)
    addLog('info', `処理を開始しました。Job ID: ${jobId}`)
  // Keep current EventSource instance in a ref so that reconnect replacements
  // are retained and not garbage-collected. (Codex review P1 fix)
  const esRef = { current: new EventSource(`/api/jobs/${jobId}/events`) }
  let reconnectTimer: NodeJS.Timeout | null = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  let fallbackPollingTimer: NodeJS.Timeout | null = null
  let sseConnected = true

    const handlePayload = (raw: string) => {
      try {
        const data = JSON.parse(raw) as JobData
        lastJobRef.current = data.job
        const result = updateStepsFromJobData(data)
        if (result === 'stop') {
          const completed = data.job.status === 'completed' || data.job.status === 'complete'
          if (completed || data.job.renderCompleted === true) {
            console.log('[SSE] Job completed, transitioning to results page')
            addLog('info', '処理が完了しました。上部のエクスポートからダウンロードできます。')
            setCompleted(true)
          } else if (data.job.status === 'failed') {
            const errorStep = data.job.lastErrorStep || data.job.currentStep || '不明'
            const errorMessage = data.job.lastError || 'エラーの詳細が不明です'
            console.error('[SSE] Job failed:', { errorStep, errorMessage })
            addLog('error', `処理が失敗しました - ${errorStep}: ${errorMessage}`)
          }
        }
      } catch (e: unknown) {
        const errMsg =
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null && 'message' in e
              ? String((e as { message?: unknown }).message ?? String(e))
              : String(e)
        addLog('error', `SSEデータの解析に失敗: ${errMsg}`)
      }
    }

    // フォールバックポーリング関数
    const fallbackPolling = async () => {
      if (!sseConnected && isMountedRef.current) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`)
          if (res.ok) {
            const data = await res.json()
            const jobData = data as JobData
            lastJobRef.current = jobData.job
            const result = updateStepsFromJobData(jobData)
            if (result === 'stop') {
              const completed =
                jobData.job.status === 'completed' || jobData.job.status === 'complete'
              if (completed || jobData.job.renderCompleted === true) {
                console.log('[Fallback] Job completed via polling, transitioning to results page')
                addLog(
                  'info',
                  '処理が完了しました（フォールバックポーリングにより検知）。上部のエクスポートからダウンロードできます。',
                )
                setCompleted(true)
              } else if (jobData.job.status === 'failed') {
                const errorStep = jobData.job.lastErrorStep || jobData.job.currentStep || '不明'
                const errorMessage = jobData.job.lastError || 'エラーの詳細が不明です'
                console.error('[Fallback] Job failed:', { errorStep, errorMessage })
                addLog('error', `処理が失敗しました - ${errorStep}: ${errorMessage}`)
              }
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Fallback polling failed:', e)
          }
        }
      }
    }

    const attachEventHandlers = (target: EventSource) => {
      target.addEventListener('init', (ev) => {
        setSseConnected(true)
        console.log('[SSE] Connected and received init data')
        handlePayload((ev as MessageEvent).data)
      })
      target.addEventListener('message', (ev) => {
        setSseConnected(true)
        console.log('[SSE] Received message')
        handlePayload((ev as MessageEvent).data)
      })
      target.addEventListener('final', (ev) => {
        setSseConnected(true)
        console.log('[SSE] Received final message - job completed')
        handlePayload((ev as MessageEvent).data)
      })
      target.addEventListener('error', (ev) => {
        setSseConnected(false)
        console.warn('[SSE] Connection error:', ev)
        addLog('warning', 'SSE接続に問題が発生しました。再接続を試行します。', ev)
        handleReconnect()
      })
    }

    const handleReconnect = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        setSseConnected(false)
        addLog(
          'error',
          'SSE接続の再接続が最大回数に達しました。フォールバックポーリングを開始します。',
        )
        sseConnected = false
        // SSEが完全に失敗した場合、30秒ごとにポーリング
        fallbackPollingTimer = setInterval(fallbackPolling, 30000)
        return
      }

      reconnectAttempts++
      addLog(
        'warning',
        `SSE接続が切断されました。再接続を試行します... (${reconnectAttempts}/${maxReconnectAttempts})`,
      )

      // 指数バックオフで再接続
      const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 30000)
      reconnectTimer = setTimeout(() => {
        if (!isMountedRef.current) return
        // Close old instance
        try {
          esRef.current.close()
        } catch {
          /* noop */
        }
        // Create and attach new instance, keeping reference
        const replacement = new EventSource(`/api/jobs/${jobId}/events`)
        esRef.current = replacement
        attachEventHandlers(replacement)
      }, delay)
    }
    // Attach handlers to initial instance
    attachEventHandlers(esRef.current)

    return () => {
      isMountedRef.current = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (fallbackPollingTimer) clearInterval(fallbackPollingTimer)
      try {
        esRef.current.close()
      } catch {
        /* ignore */
      }
    }
  }, [jobId, addLog, updateStepsFromJobData])

  useEffect(() => {
    if (completed) {
      // ジョブ完了時に少し待ってから遷移（UIの更新を確実にするため）
      const timer = setTimeout(() => {
        onComplete?.()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [completed, onComplete])

  useEffect(() => {
    if (jobId) return
    setSteps((prev) => {
      const updated = prev.map((s) => ({ ...s }))
      updated[0].status = 'processing'
      return updated
    })
    setActiveStep(0)
    setOverallProgress(0)
    addLog('info', '準備中: アップロードを開始しています')
  }, [jobId, addLog])

  type EpisodeCard = {
    ep: number
    planned: number
    rendered: number
    total?: number
    validation?: {
      normalizedPages: number[]
      pagesWithIssueCounts: Record<number, number>
      issuesCount: number
    }
    isCompleted: boolean
    isCurrent: boolean
    isInProgress: boolean
    normalizedCount: number
  }

  const episodeProgressCards = useMemo(() => {
    const cards: EpisodeCard[] = Object.entries(perEpisodePages).map(([epStr, v]) => {
      const ep = Number(epStr)
      const isCompleted =
        typeof v.total === 'number' && v.total > 0 && v.planned >= v.total && v.rendered >= v.total
      const isCurrent = currentLayoutEpisode === ep
      const isInProgress = !isCompleted && v.planned > 0
      const normalizedCount = v.validation?.normalizedPages?.length ?? 0
      return {
        ep,
        planned: v.planned,
        rendered: v.rendered,
        total: v.total,
        validation: v.validation,
        isCompleted,
        isCurrent,
        isInProgress,
        normalizedCount,
      }
    })
    cards.sort((a, b) => {
      const score = (x: EpisodeCard) =>
        x.isCurrent ? 0 : x.isInProgress ? 1 : x.isCompleted ? 3 : 2
      return score(a) - score(b) || a.ep - b.ep
    })
    return cards
  }, [perEpisodePages, currentLayoutEpisode])

  const hasFailedStep = steps.some((step) => step.status === 'error')
  const failedStep = steps.find((step) => step.status === 'error')

  return (
    <div className="space-y-3">
      {normalizationToastShown && (
        <Alert variant="warning" className="fixed right-5 top-20 z-[1400]">
          安全装置: ページ番号の正規化を適用しました（上限 {_MAX_PAGES} ページ）
        </Alert>
      )}
      {hasFailedStep && failedStep && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>
            <p className="font-semibold">{failedStep.name}でエラーが発生しました。</p>
            {failedStep.error && <p className="text-sm">{failedStep.error}</p>}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">処理進捗</div>
            {showLogsFlag && (
              <Button variant="outline" size="sm" onClick={() => setShowLogs(!showLogs)}>
                {showLogs ? 'ログを隠す' : 'ログを表示'}
              </Button>
            )}
          </div>

          {modeHint && <Alert className="mb-2">{modeHint}</Alert>}

          <div className="mb-2 flex items-center gap-2">
            <div className="w-full">
              <Progress value={overallProgress} />
            </div>
            <div className="text-xs text-muted-foreground">{Math.round(overallProgress)}%</div>
          </div>

          {jobId && (
            <div className="flex items-center justify-between rounded-md border p-2">
              <div className="text-sm">
                トークン使用量 (入力/出力): {tokenPromptSum.toLocaleString()} /{' '}
                {tokenCompletionSum.toLocaleString()}
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={completed ? 'success' : 'warning'}>
                  {completed ? '確定' : '暫定'}
                </Badge>
                {process.env.NODE_ENV === 'development' && (
                  <Badge variant={sseConnected ? 'success' : 'warning'}>
                    {sseConnected ? 'SSE接続中' : 'ポーリング中'}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="relative">
        <ol className="border-l pl-4">
          {steps.map((step, index) => {
            const isActive = index === activeStep
            const isCompleted = step.status === 'completed'
            const isError = step.status === 'error'
            return (
              <li key={step.id} className="mb-4">
                <div className="mb-1 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border bg-muted">
                    {isError ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : isActive ? (
                      <Hourglass className="h-4 w-4 text-primary" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                    )}
                  </div>
                  <div className="font-medium">{step.name}</div>
                </div>
                <div className="ml-8 text-sm text-muted-foreground">
                  <p>{step.description}</p>
                  {runtimeHints[step.id as HintStep] && (
                    <p className="text-primary">{runtimeHints[step.id as HintStep]}</p>
                  )}
                  {step.status === 'processing' && step.progress !== undefined && (
                    <div className="mt-1">
                      <Progress value={step.progress} />
                    </div>
                  )}
                  {step.status === 'error' && step.error && (
                    <Alert variant="destructive" className="mt-1">
                      {step.error}
                    </Alert>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {Object.keys(perEpisodePages).length > 0 && (
        <Card>
          <CardContent>
            <div className="mb-2 font-semibold">エピソード進捗</div>
            <div className="flex flex-wrap gap-2">
              {episodeProgressCards.map(
                ({ ep, planned, rendered, total, normalizedCount, isCompleted, isCurrent }) => {
                  const totalPages = total || planned || 1
                  const progress = totalPages > 0 ? Math.round((rendered / totalPages) * 100) : 0
                  return (
                    <Card
                      key={ep}
                      className={`flex-1 min-w-[150px] ${isCurrent ? 'border-primary' : ''}`}
                    >
                      <CardContent className="p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <div className="text-sm font-semibold">EP{ep}</div>
                          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                          {normalizedCount > 0 && (
                            <Badge variant="warning" className="h-4 px-1 text-[10px]">
                              N:{normalizedCount}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {rendered} / {totalPages} ページ
                        </div>
                        <div className="mt-1">
                          <Progress value={progress} />
                        </div>
                      </CardContent>
                    </Card>
                  )
                },
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showLogsFlag && (
        <Card>
          <CardContent>
            <div className="font-semibold">開発ログ</div>
            <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-md border p-2 text-sm">
              {logs.length === 0 ? (
                <div className="text-muted-foreground">ログはまだありません</div>
              ) : (
                logs.map((log) => (
                  <Alert
                    key={log.id}
                    className="mb-2 text-[0.8rem]"
                    variant={
                      log.level === 'error'
                        ? 'destructive'
                        : log.level === 'warning'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    <span className="mr-2 text-xs opacity-70">{log.timestamp}</span>
                    {log.message}
                  </Alert>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default memo(ProcessingProgress)
