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
import type { Job } from '@/types/job-sse'
import { parseJobSSEPayload } from '@/types/job-sse'

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

interface JobData { job: Job }

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
  { id: 'upload', name: 'アップロード', description: 'テキストファイルをアップロード中', status: 'pending' },
  { id: 'split', name: 'チャンク分割', description: 'テキストを適切なサイズに分割中', status: 'pending' },
  { id: 'analyze', name: '要素分析', description: '登場人物・シーン・対話を抽出中', status: 'pending' },
  { id: 'episode', name: 'エピソード構成', description: '物語の流れを分析中', status: 'pending' },
  { id: 'layout', name: 'レイアウト生成', description: 'マンガのコマ割りを作成中', status: 'pending' },
  { id: 'render', name: 'レンダリング', description: '絵コンテ画像を生成中', status: 'pending' },
]

const STEP_PERCENT = 100 / (INITIAL_STEPS.length || 1)

type LastKnownTotals = {
  chunks: number | null
  episodes: number | null
  pages: number | null
}

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const resolvePositiveTotal = (
  reported: number | null | undefined,
  lastKnown: number | null | undefined,
  minimum: number,
): number => {
  if (isPositiveFiniteNumber(reported)) return reported
  if (isPositiveFiniteNumber(lastKnown)) return lastKnown
  return Math.max(1, minimum)
}

export function calculateRenderProgress(job: Job | Record<string, unknown>): number {
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

export function calculateOverallProgress(job: Job | Record<string, unknown>, completedCount: number): number {
  const baseProgress = Math.round(completedCount * STEP_PERCENT)
  const jr = job as Record<string, unknown>
  const currentStep = jr.currentStep
  if (typeof currentStep === 'string' && (currentStep === 'render' || currentStep.startsWith('render_'))) {
    const totalPages = jr.totalPages
    const renderedPages = jr.renderedPages
    if (typeof totalPages === 'number' && typeof renderedPages === 'number' && totalPages > 0) {
      const renderProgress = (renderedPages / totalPages) * STEP_PERCENT
      return Math.round(baseProgress + renderProgress)
    }
  }
  return baseProgress
}

function ProcessingProgress({ jobId, onComplete, modeHint, isDemoMode, currentEpisodeProgressWeight }: ProcessingProgressProps) {
  const [steps, setSteps] = useState<ProcessStep[]>(() => INITIAL_STEPS.map((s) => ({ ...s })))
  const [activeStep, setActiveStep] = useState(-1)
  const [overallProgress, setOverallProgress] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const showLogsFlag = process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1' || process.env.NODE_ENV === 'development'
  const [showLogs, setShowLogs] = useState(showLogsFlag)
  const [lastJobData, setLastJobData] = useState<string>('')
  const logCounterRef = useRef(0)
  type HintStep = 'split' | 'analyze' | 'layout' | 'render'
  const [runtimeHints, setRuntimeHints] = useState<Partial<Record<HintStep, string>>>({})
  const [perEpisodePages, setPerEpisodePages] = useState<Record<number, EpisodePageData>>({})
  const [currentLayoutEpisode, setCurrentLayoutEpisode] = useState<number | null>(null)
  const [completed, setCompleted] = useState(false)
  const [normalizationToastShown, setNormalizationToastShown] = useState(false)
  const [tokenPromptSum, setTokenPromptSum] = useState(0)
  const [tokenCompletionSum, setTokenCompletionSum] = useState(0)
  const [sseConnected, setSseConnected] = useState(true)

  const isMountedRef = useRef(false)
  const lastJobRef = useRef<Job | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const lastKnownTotalsRef = useRef<LastKnownTotals>({ chunks: null, episodes: null, pages: null })

  const inProgressWeight = useMemo(() => {
    const w = typeof currentEpisodeProgressWeight === 'number' ? currentEpisodeProgressWeight : DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    if (Number.isNaN(w)) return DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
    return Math.max(0, Math.min(1, w))
  }, [currentEpisodeProgressWeight])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  const addLog = useCallback((level: 'info' | 'error' | 'warning', message: string, data?: unknown) => {
    const id = logCounterRef.current++
    const logEntry: LogEntry = { id, timestamp: new Date().toLocaleTimeString(), level, message, data }
    setLogs((prev) => {
      const lastLog = prev[prev.length - 1]
      if (lastLog && lastLog.message === message && lastLog.level === level) return prev
      return [...prev.slice(-MAX_LOG_ENTRIES + 1), logEntry]
    })
  }, [])

  const updateStepsFromJobData = useCallback(
    (data: JobData) => {
      // lightweight diffing and ui updates — keep stable and purely functional
      const job = data.job

      const totals = lastKnownTotalsRef.current
      if (isPositiveFiniteNumber(job.totalChunks)) totals.chunks = job.totalChunks
      if (isPositiveFiniteNumber(job.totalEpisodes)) totals.episodes = job.totalEpisodes
      if (isPositiveFiniteNumber(job.totalPages)) totals.pages = job.totalPages

      // fast equality check to avoid repeated UI work
      const jobDataString = JSON.stringify({
        id: job.id,
        status: job.status,
        currentStep: job.currentStep,
        splitCompleted: job.splitCompleted,
        analyzeCompleted: job.analyzeCompleted,
        episodeCompleted: job.episodeCompleted,
        layoutCompleted: job.layoutCompleted,
        renderCompleted: job.renderCompleted,
        processedChunks: job.processedChunks,
        totalChunks: job.totalChunks,
        processedEpisodes: job.processedEpisodes,
        totalEpisodes: job.totalEpisodes,
        renderedPages: job.renderedPages,
        totalPages: job.totalPages,
        processingEpisode: job.processingEpisode,
        processingPage: job.processingPage,
      })

      if (jobDataString === lastJobData) {
        const totalPages = Number(job.totalPages || 0)
        const renderedPages = Number(job.renderedPages || 0)
        const fallbackCompleted = job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
        const statusCompleted = job.status === 'completed' || job.status === 'complete'
        const uiCompleted = job.renderCompleted === true || fallbackCompleted || statusCompleted
        // no-op or signal stop
        return uiCompleted || job.status === 'failed' ? 'stop' : null
      }

      setLastJobData(jobDataString)

      // logs
      addLog('info', describeStep(job.currentStep ?? ''))
      if (job.lastError) addLog('error', `${describeStep(job.lastErrorStep || '')}に失敗: ${job.lastError}`)

      // normalization toast: show a one-time warning when page counts hit the cap
      if (!normalizationToastShown && typeof job.totalPages === 'number' && job.totalPages >= _MAX_PAGES && (job.currentStep === 'render' || String(job.currentStep || '').startsWith('render'))) {
        addLog('warning', `安全装置: ページ番号の正規化を適用しました（上限 ${_MAX_PAGES} ページにキャップ）`)
        setNormalizationToastShown(true)
      }

      // per-episode normalization
      if (job.progress?.perEpisodePages) {
        const normalized: Record<number, EpisodePageData> = {}
        for (const [k, v] of Object.entries(job.progress.perEpisodePages)) {
          const episodeNumber = Number(k)
          if (Number.isNaN(episodeNumber)) continue
          const parsed = EpisodePageDataSchema.safeParse(v)
          if (parsed.success) {
            normalized[episodeNumber] = parsed.data
          } else if (v && typeof v === 'object') {
            const legacy = v as Record<string, unknown>
            if (typeof legacy.actualPages === 'number') {
              normalized[episodeNumber] = {
                planned: legacy.actualPages as number,
                rendered: (legacy.rendered as number) ?? 0,
                total: legacy.actualPages as number,
                validation: legacy.validation as EpisodePageData['validation'],
              }
            }
          }
        }
        setPerEpisodePages(normalized)
      }

      // update steps UI
      setSteps((prevSteps) => {
        const updatedSteps = prevSteps.map((s) => ({ ...s }))
        let completedCount = 0

        const totalPages = Number(job.totalPages || 0)
        const renderedPages = Number(job.renderedPages || 0)
        const fallbackCompleted = job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
        const statusCompleted = job.status === 'completed' || job.status === 'complete'
        const uiCompleted = job.renderCompleted === true || fallbackCompleted || statusCompleted

        if (uiCompleted) {
          for (let idx = 0; idx < updatedSteps.length; idx++) {
            updatedSteps[idx].status = 'completed'
          }
          addLog('info', '全ての処理が完了しました')
          setCompleted(true)
          setActiveStep(INITIAL_STEPS.length)
          return updatedSteps
        }

        if (job.status === 'failed') {
          const failedStepMap: Record<string, number> = { split: 1, analyze: 2, episode: 3, layout: 4, render: 5 }
          const rawStep = job.currentStep || ''
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
          for (let index = 0; index < updatedSteps.length; index++) {
            const step = updatedSteps[index]
            if (index < failedIndex) {
              step.status = 'completed'
              completedCount++
            } else if (index === failedIndex) {
              step.status = 'error'
              step.error = job.lastError
            } else {
              step.status = 'pending'
            }
          }
          addLog('error', `処理が失敗しました: ${job.lastError}`)
          setActiveStep(failedIndex)
          return updatedSteps
        }

        // base: upload is always completed
        updatedSteps[0].status = 'completed'
        completedCount++

        const stepChecks = [
          { flag: job.splitCompleted, processing: ['split', 'chunks_created'], index: 1, progressKey: 'processedChunks', totalKey: 'totalChunks' },
          { flag: job.analyzeCompleted, processing: ['analyze', 'analyze_'], index: 2, progressKey: 'processedChunks', totalKey: 'totalChunks' },
          { flag: job.episodeCompleted, processing: ['episode', 'episode_'], index: 3, progressKey: 'processedChunks', totalKey: 'totalChunks' },
          { flag: job.layoutCompleted, processing: ['layout', 'layout_'], index: 4, progressKey: 'processedEpisodes', totalKey: 'totalEpisodes' },
          { flag: job.renderCompleted, processing: ['render', 'render_'], index: 5, progressKey: 'renderedPages', totalKey: 'totalPages' },
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
          } else if (check.processing.some((p) => String(job.currentStep || '').startsWith(p))) {
            updatedSteps[check.index].status = 'processing'
            if (check.index === 4) {
              const total = job.totalEpisodes || 0
              const processed = job.processedEpisodes || 0
              const match = String(job.currentStep).match(/layout_episode_(\d+)/)
              const currentNum = match ? parseInt(match[1], 10) : DEFAULT_EPISODE_NUMBER
              const processedWithCurrent = processed + (currentNum > processed ? inProgressWeight : 0)
              updatedSteps[check.index].progress = total > 0 ? Math.round((processedWithCurrent / total) * 100) : 0
            } else if (check.index === 5) {
              updatedSteps[check.index].progress = calculateRenderProgress(job as unknown as Record<string, unknown>)
            } else {
              const jobRecord = job as Record<string, unknown>
              const total = jobRecord[check.totalKey]
              const processed = jobRecord[check.progressKey]
              if (typeof total === 'number' && typeof processed === 'number' && total > 0)
                updatedSteps[check.index].progress = Math.round((processed / total) * 100)
            }
            foundProcessing = true
          }
        }

        if (!foundProcessing) setActiveStep(completedCount)
        else setActiveStep((prev) => Math.max(prev, 0))

        // emit logs for state transitions (compare previous and updated) — uses isDemoMode
        for (let i = 0; i < updatedSteps.length; i++) {
          const prev = prevSteps[i]
          const cur = updatedSteps[i]
          if (!prev) continue
          if (prev.status !== cur.status) {
            if (cur.status === 'processing') addLog('info', `${cur.name} を開始しました`)
            else if (cur.status === 'completed') {
              if (isDemoMode && (cur.id === 'analyze' || cur.id === 'episode')) addLog('info', `デモ: ${cur.name} をスキップ（仮完了）しました`)
              else addLog('info', `${cur.name} が完了しました`)
            } else if (cur.status === 'error') addLog('error', `${cur.name} でエラーが発生しました`)
          }
        }

        const hints: Partial<Record<HintStep, string>> = {}
        const stepId = job.currentStep || ''
        const analyzeMatch = stepId.match(/^analyze_chunk_(\d+)(?:_(retry|done))?$/)
        if (analyzeMatch && !job.analyzeCompleted) {
          const idx = Number(analyzeMatch[1])
          const chunkTotal = resolvePositiveTotal(job.totalChunks, lastKnownTotalsRef.current.chunks, idx + 1)
          const currentChunkNumber = Math.min(idx + 1, chunkTotal)
          hints.analyze = `現在: チャンク ${currentChunkNumber} / ${chunkTotal} を分析中`
        }
        const layoutMatch = stepId.match(/^layout_episode_(\d+)$/)
        if (layoutMatch && !job.layoutCompleted) {
          const ep = Number(layoutMatch[1])
          const normalizedEpisode = ep > 0 ? ep : 1
          // ensure the rest of the component sees a 1-based/normalized episode number
          setCurrentLayoutEpisode(normalizedEpisode)
          const totalEp = resolvePositiveTotal(job.totalEpisodes, lastKnownTotalsRef.current.episodes, normalizedEpisode)
          const currentEpisodeNumber = Math.min(normalizedEpisode, totalEp)
          hints.layout = `現在: エピソード ${currentEpisodeNumber} / ${totalEp} をレイアウト中`
        }
        if ((stepId === 'render' || stepId.startsWith('render_')) && !job.renderCompleted) {
          const total = job.totalPages || 0
          const rendered = job.renderedPages ?? 0
          const processingPage = job.processingPage
          const processingEpisode = job.processingEpisode
          if (total > 0) {
            const progressPercent = Math.round((rendered / total) * 100)
            if (processingPage && processingEpisode) hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中 (${rendered}/${total}完了 ${progressPercent}%)`
            else hints.render = `現在: ${rendered}/${total}ページ完了 (${progressPercent}%)`
          } else {
            if (processingPage && processingEpisode) hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中`
            else hints.render = `現在: ${rendered}ページ完了`
          }
        }

        setRuntimeHints(hints)
        setOverallProgress(calculateOverallProgress(job as unknown as Record<string, unknown>, completedCount))
        return updatedSteps
      })

      const statusCompleted = job.status === 'completed' || job.status === 'complete'
      return statusCompleted || job.status === 'failed' ? 'stop' : 'continue'
    },
    [addLog, describeStep, inProgressWeight, lastJobData, normalizationToastShown, isDemoMode],
  )

  const updateStepsRef = useRef(updateStepsFromJobData)
  useEffect(() => {
    updateStepsRef.current = updateStepsFromJobData
  }, [updateStepsFromJobData])

  // initialize state when jobId becomes available
  useEffect(() => {
    if (!jobId) return

    try {
      esRef.current?.close()
    } catch {
      /* noop */
    }

    setLastJobData('')
    setLogs([])
    setPerEpisodePages({})
    setRuntimeHints({})
  setCurrentLayoutEpisode(null)
    setCompleted(false)
    setNormalizationToastShown(false)
    setTokenPromptSum(0)
    setTokenCompletionSum(0)
    setSseConnected(true)
  // reset cached totals to avoid inheriting totals from a previous job when SSE payloads omit them
  lastKnownTotalsRef.current = { chunks: null, episodes: null, pages: null }

    setSteps(() =>
      INITIAL_STEPS.map((step, index) => ({
        ...step,
        status: index === 0 ? 'completed' : 'pending',
        progress: undefined,
        error: undefined,
      })),
    )
    setOverallProgress(Math.round(STEP_PERCENT))
    setActiveStep(1)
    addLog('info', '準備中: アップロードを開始しています')
    addLog('info', `処理を開始しました。Job ID: ${jobId}`)
  }, [jobId, addLog])

  // トークン使用量のポーリング（既存 token-usage API 利用）
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const interval = appConfig.ui.progress.tokenUsagePollIntervalMs
    const fetchTokens = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/token-usage`)
        if (!res.ok) return
        const data = (await res.json()) as { tokenUsage?: Array<{ promptTokens?: number; completionTokens?: number }> }
        if (cancelled) return
        if (Array.isArray(data.tokenUsage)) {
          const prompt = data.tokenUsage.reduce((acc, r) => acc + (r.promptTokens ?? 0), 0)
          const completion = data.tokenUsage.reduce((acc, r) => acc + (r.completionTokens ?? 0), 0)
          setTokenPromptSum(prompt)
          setTokenCompletionSum(completion)
        }
      } catch {
        /* noop */
      }
    }
    fetchTokens()
    const timer = setInterval(fetchTokens, interval)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return

    let reconnectTimer: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = appConfig.ui.sse.maxReconnectAttempts
    let fallbackPollingTimer: NodeJS.Timeout | null = null
    let alive = true

    const handlePayload = (raw: string) => {
      try {
        const parsed = parseJobSSEPayload(raw)
        const data: JobData = { job: parsed.job }
        lastJobRef.current = data.job
        const updater = updateStepsRef.current
        if (!updater) return
        const result = updater(data)
        if (result === 'stop') {
          const done = data.job.status === 'completed' || data.job.status === 'complete' || data.job.renderCompleted === true
          if (done) {
            addLog('info', '処理が完了しました。上部のエクスポートからダウンロードできます。')
            setCompleted(true)
          } else if (data.job.status === 'failed') {
            const errorStep = data.job.lastErrorStep || data.job.currentStep || '不明'
            const errorMessage = data.job.lastError || 'エラーの詳細が不明です'
            addLog('error', `処理が失敗しました - ${errorStep}: ${errorMessage}`)
          }
        }
      } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
        addLog('error', `SSEデータの解析/検証に失敗: ${errMsg}`)
      }
    }

    const fallbackPolling = async () => {
      if (!alive && isMountedRef.current) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`)
          if (res.ok) {
            const json = (await res.json()) as
              | JobData
              | { data?: { job?: Job } }
              | { job?: Job }
            const jobPayload =
              (json as JobData).job ??
              (json as { data?: { job?: Job } }).data?.job
            if (!jobPayload) return
            lastJobRef.current = jobPayload
            const updater = updateStepsRef.current
            if (!updater) return
            const result = updater({ job: jobPayload })
            if (result === 'stop') {
              const done = jobPayload.status === 'completed' || jobPayload.status === 'complete' || jobPayload.renderCompleted === true
              if (done) {
                addLog('info', '処理が完了しました（フォールバックポーリングにより検知）。上部のエクスポートからダウンロードできます。')
                setCompleted(true)
              } else if (jobPayload.status === 'failed') {
                const errStep = jobPayload.lastErrorStep || jobPayload.currentStep || '不明'
                const errMsg = jobPayload.lastError || 'エラーの詳細が不明です'
                addLog('error', `処理が失敗しました - ${errStep}: ${errMsg}`)
              }
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') console.warn('Fallback polling failed:', e)
        }
      }
    }

    const attachEventHandlers = (target: EventSource) => {
      target.addEventListener('init', (ev) => {
        setSseConnected(true)
        handlePayload((ev as MessageEvent).data)
      })
      target.addEventListener('message', (ev) => {
        setSseConnected(true)
        handlePayload((ev as MessageEvent).data)
      })
      target.addEventListener('final', (ev) => {
        setSseConnected(true)
        handlePayload((ev as MessageEvent).data)
      })
      target.addEventListener('error', (ev) => {
        setSseConnected(false)
        addLog('warning', 'SSE接続に問題が発生しました。再接続を試行します。', ev)
        handleReconnect()
      })
    }

    const handleReconnect = () => {
      reconnectAttempts++
      if (reconnectAttempts > maxReconnectAttempts) {
        alive = false
        setSseConnected(false)
        addLog('error', 'SSE接続の再接続が最大回数に達しました。フォールバックポーリングを開始します。')
        fallbackPollingTimer = setInterval(fallbackPolling, appConfig.ui.sse.fallbackPollingIntervalMs)
        return
      }
      setSseConnected(false)
      addLog('warning', `SSE接続が切断されました。再接続を試行します... (${reconnectAttempts}/${maxReconnectAttempts})`)
      const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), appConfig.ui.sse.maxReconnectDelayMs)
      reconnectTimer = setTimeout(() => {
        if (!isMountedRef.current) return
        try {
          esRef.current?.close()
        } catch {
          /* noop */
        }
        const replacement = new EventSource(`/api/jobs/${jobId}/events`)
        esRef.current = replacement
        attachEventHandlers(replacement)
      }, delay)
    }

    // 初期接続
    try {
      esRef.current?.close()
    } catch {/* ignore */}
    esRef.current = new EventSource(`/api/jobs/${jobId}/events`)
    attachEventHandlers(esRef.current)

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (fallbackPollingTimer) clearInterval(fallbackPollingTimer)
      try {
        esRef.current?.close()
      } catch {
        /* ignore */
      }
    }
  }, [jobId, addLog])

  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => onComplete?.(), 1000)
      return () => clearTimeout(timer)
    }
  }, [completed, onComplete])

  const episodeProgressCards = useMemo(() => {
    const cards = Object.entries(perEpisodePages).map(([epStr, v]) => {
      const ep = Number(epStr)
      const isCompleted = typeof v.total === 'number' && v.total > 0 && v.planned >= v.total && v.rendered >= v.total
      const isCurrent = currentLayoutEpisode === ep
      const isInProgress = !isCompleted && v.planned > 0
      const normalizedCount = v.validation?.normalizedPages?.length ?? 0
      return { ep, planned: v.planned, rendered: v.rendered, total: v.total, validation: v.validation, isCompleted, isCurrent, isInProgress, normalizedCount }
    })
    cards.sort((a, b) => {
      const score = (x: { isCurrent: boolean; isInProgress: boolean; isCompleted: boolean }) => (x.isCurrent ? 0 : x.isInProgress ? 1 : x.isCompleted ? 3 : 2)
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
                トークン使用量 (入力/出力): {tokenPromptSum.toLocaleString()} / {tokenCompletionSum.toLocaleString()}
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={completed ? 'success' : 'warning'}>{completed ? '確定' : '暫定'}</Badge>
                {process.env.NODE_ENV === 'development' && (
                  <Badge variant={sseConnected ? 'success' : 'warning'}>{sseConnected ? 'SSE接続中' : 'ポーリング中'}</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <ol className="border-l border-muted-foreground/20 pl-4">
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
                      {runtimeHints[step.id as HintStep] && <p className="text-primary">{runtimeHints[step.id as HintStep]}</p>}
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
        </CardContent>
      </Card>

      {episodeProgressCards.length > 0 && (
        <Card>
          <CardContent>
            <div className="mb-2 font-semibold">エピソード進捗</div>
            <div className="flex flex-wrap gap-2">
              {episodeProgressCards.map(({ ep, planned, rendered, total, normalizedCount, isCompleted, isCurrent }) => {
                const totalPages = total || planned || 1
                const progress = totalPages > 0 ? Math.round((rendered / totalPages) * 100) : 0
                return (
                  <Card key={ep} className={`flex-1 min-w-[150px] ${isCurrent ? 'border-primary' : ''}`}>
                    <CardContent className="p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-sm font-semibold">EP{ep}</div>
                        {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                        {normalizedCount > 0 && (
                          <Badge variant="warning" className="h-4 px-1 text-[10px]">N:{normalizedCount}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{rendered} / {totalPages} ページ</div>
                      <div className="mt-1">
                        <Progress value={progress} />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
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
                  <Alert key={log.id} className="mb-2 text-[0.8rem]" variant={log.level === 'error' ? 'destructive' : log.level === 'warning' ? 'warning' : 'default'}>
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
