'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { appConfig } from '@/config/app.config'
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Typography,
  LinearProgress,
  Card,
  CardContent,
  Alert,
  Collapse,
  IconButton,
  Button,
  Chip,
  Paper,
  Stack,
  Tooltip,
  useTheme,
} from '@mui/material'
import {
  CheckCircle,
  Error,
  HourglassEmpty,
} from '@mui/icons-material'
import Check from '@mui/icons-material/Check'

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

const DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT =
  appConfig.ui.progress.currentEpisodeProgressWeight ?? 0.5
const MAX_LOG_ENTRIES = appConfig.ui.logs.maxEntries
const MAX_VISIBLE_LOG_HEIGHT = appConfig.ui.logs.maxVisibleLogHeightVh
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

function calculateRenderProgress(job: Record<string, unknown>): number {
  const totalPages = job.totalPages
  const renderedPages = job.renderedPages
  if (typeof totalPages !== 'number' || typeof renderedPages !== 'number' || totalPages === 0) {
    return 0
  }
  const baseProgress = Math.round((renderedPages / totalPages) * 100)
  const processingPage = job.processingPage
  if (typeof processingPage === 'number' && processingPage > 0 && renderedPages < totalPages) {
    const partialProgress = Math.round((0.5 / totalPages) * 100)
    return Math.min(99, baseProgress + partialProgress)
  }
  return Math.min(100, baseProgress)
}

function calculateOverallProgress(job: Record<string, unknown>, completedCount: number): number {
  const baseProgress = Math.round(completedCount * STEP_PERCENT)
  const currentStep = job.currentStep
  if (typeof currentStep === 'string' && (currentStep === 'render' || currentStep.startsWith('render_'))) {
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
  const [steps, setSteps] = useState<ProcessStep[]>(() => INITIAL_STEPS.map((step) => ({ ...step })))
  const [activeStep, setActiveStep] = useState(-1)
  const [overallProgress, setOverallProgress] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const showLogsFlag = process.env.NEXT_PUBLIC_SHOW_PROGRESS_LOGS === '1' || process.env.NODE_ENV === 'development'
  const [showLogs, setShowLogs] = useState(showLogsFlag)
  const [lastJobData, setLastJobData] = useState<string>('')
  type HintStep = 'split' | 'analyze' | 'layout' | 'render'
  const [runtimeHints, setRuntimeHints] = useState<Partial<Record<HintStep, string>>>({})
  const [perEpisodePages, setPerEpisodePages] = useState<Record<number, { planned: number; rendered: number; total?: number; validation?: { normalizedPages: number[]; pagesWithIssueCounts: Record<number, number>; issuesCount: number } }>>({})
  const [currentLayoutEpisode, setCurrentLayoutEpisode] = useState<number | null>(null)
  const [dbPageTotals, setDbPageTotals] = useState<{ totalPages: number; renderedPages: number }>({ totalPages: 0, renderedPages: 0 })
  const [completed, setCompleted] = useState(false)
  const [normalizationToastShown, setNormalizationToastShown] = useState(false)
  const [tokenPromptSum, setTokenPromptSum] = useState(0)
  const [tokenCompletionSum, setTokenCompletionSum] = useState(0)
  const isMountedRef = useRef(true)
  const lastJobRef = useRef<JobData['job'] | null>(null)
  const theme = useTheme()

  const inProgressWeight = useMemo(() => {
    const w = typeof currentEpisodeProgressWeight === 'number' ? currentEpisodeProgressWeight : DEFAULT_CURRENT_EPISODE_PROGRESS_WEIGHT
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
        const json = (await res.json()) as { tokenUsage?: Array<{ promptTokens: number; completionTokens: number }> }
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

  const EpisodePageDataSchema = useMemo(() => z.object({
    planned: z.number(),
    rendered: z.number(),
    total: z.number().optional(),
    validation: z.object({
      normalizedPages: z.array(z.number()),
      pagesWithIssueCounts: z.record(z.number()).optional(),
      issuesCount: z.number().optional(),
    }).optional(),
  }), [])

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
    const logEntry: LogEntry = { timestamp: new Date().toLocaleTimeString(), level, message, data }
    setLogs((prev) => {
      const lastLog = prev[prev.length - 1]
      if (lastLog && lastLog.message === message && lastLog.level === level) return prev
      return [...prev.slice(-MAX_LOG_ENTRIES + 1), logEntry]
    })
  }, [])

  const updateStepsFromJobData = useCallback((data: JobData) => {
    const perEpisodeSummary = (() => {
      const pep = data.job.progress?.perEpisodePages as Record<string, { planned?: number; rendered?: number; total?: number }> | undefined
      if (!pep) return { count: 0, renderedSum: 0, totalSum: 0 }
      let renderedSum = 0, totalSum = 0
      const entries = Object.entries(pep)
      for (const [, v] of entries) {
        if (typeof v?.rendered === 'number') renderedSum += v.rendered
        if (typeof v?.total === 'number') totalSum += v.total
      }
      return { count: entries.length, renderedSum, totalSum }
    })()

    const jobDataString = JSON.stringify({
      status: data.job.status, currentStep: data.job.currentStep, splitCompleted: data.job.splitCompleted,
      analyzeCompleted: data.job.analyzeCompleted, episodeCompleted: data.job.episodeCompleted,
      layoutCompleted: data.job.layoutCompleted, renderCompleted: data.job.renderCompleted,
      processedChunks: data.job.processedChunks, totalChunks: data.job.totalChunks,
      processedEpisodes: data.job.processedEpisodes, totalEpisodes: data.job.totalEpisodes,
      renderedPages: data.job.renderedPages, totalPages: data.job.totalPages,
      processingEpisode: data.job.processingEpisode, processingPage: data.job.processingPage,
      perEpisodeCount: perEpisodeSummary.count, perEpisodeRenderedSum: perEpisodeSummary.renderedSum,
      perEpisodeTotalSum: perEpisodeSummary.totalSum, lastError: data.job.lastError,
    })

    if (jobDataString === lastJobData) {
      const totalPages = Number(data.job.totalPages || 0), renderedPages = Number(data.job.renderedPages || 0)
      const fallbackCompleted = data.job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
      const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
      const uiCompleted = data.job.renderCompleted === true || fallbackCompleted || statusCompleted
      return uiCompleted || data.job.status === 'failed' ? 'stop' : null
    }

    setLastJobData(jobDataString)
    setDbPageTotals({ totalPages: Number(data.job.totalPages || 0), renderedPages: Number(data.job.renderedPages || 0) })

    if (!normalizationToastShown && typeof data.job.totalPages === 'number' && data.job.totalPages >= _MAX_PAGES && (data.job.currentStep === 'render' || String(data.job.currentStep || '').startsWith('render'))) {
      addLog('warning', `安全装置: ページ番号の正規化を適用しました（上限 ${_MAX_PAGES} ページにキャップ）`)
      setNormalizationToastShown(true)
    }
    addLog('info', describeStep(data.job.currentStep))
    if (data.job.lastError) {
      const where = data.job.lastErrorStep ? describeStep(data.job.lastErrorStep) : '処理'
      addLog('error', `${where}に失敗: ${data.job.lastError}`)
    }

    if (data.job.progress?.perEpisodePages) {
      const normalized: Record<number, { planned: number; rendered: number; total?: number; validation?: { normalizedPages: number[]; pagesWithIssueCounts: Record<number, number>; issuesCount: number } }> = {}
      for (const [k, v] of Object.entries(data.job.progress.perEpisodePages)) {
        const episodeNumber = Number(k)
        if (Number.isNaN(episodeNumber)) continue
        const parsed = EpisodePageDataSchema.safeParse(v)
        let val: z.infer<typeof EpisodePageDataSchema> | null = null
        if (parsed.success) {
          val = parsed.data
        } else if (v && typeof v === 'object' && typeof (v as { actualPages?: unknown }).actualPages === 'number' && typeof (v as { rendered?: unknown }).rendered === 'number') {
          const legacy = v as unknown as { actualPages: number; rendered: number; validation?: unknown }
          val = { planned: legacy.actualPages, rendered: legacy.rendered, total: legacy.actualPages, validation: legacy.validation as any }
        } else continue
        normalized[episodeNumber] = { ...val, validation: val.validation ? { ...val.validation, pagesWithIssueCounts: val.validation.pagesWithIssueCounts || {}, issuesCount: val.validation.issuesCount ?? 0 } : undefined }
      }
      setPerEpisodePages(normalized)
    }

    setSteps((prevSteps) => {
      const updatedSteps = prevSteps.map((step) => ({ ...step }))
      let newActiveStep = -1
      let completedCount = 0

      const totalPages = Number(data.job.totalPages || 0), renderedPages = Number(data.job.renderedPages || 0)
      const fallbackCompleted = data.job.status === 'completed' && totalPages > 0 && renderedPages >= totalPages
      const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
      const uiCompleted = data.job.renderCompleted === true || fallbackCompleted || statusCompleted

      if (uiCompleted) {
        updatedSteps.forEach((step) => { step.status = 'completed'; completedCount++ })
        addLog('info', '全ての処理が完了しました')
        setCompleted(true)
        setActiveStep(INITIAL_STEPS.length)
        return updatedSteps
      } else if (data.job.status === 'failed') {
        const failedStepMap: Record<string, number> = { split: 1, analyze: 2, episode: 3, layout: 4, render: 5 }
        const rawStep = data.job.currentStep || ''
        const normalizedStep = rawStep.startsWith('analyze_') ? 'analyze' : rawStep.startsWith('layout') ? 'layout' : rawStep.startsWith('render') ? 'render' : rawStep.startsWith('episode') ? 'episode' : rawStep
        const failedIndex = failedStepMap[normalizedStep] || 0
        updatedSteps.forEach((step, index) => {
          if (index < failedIndex) { step.status = 'completed'; completedCount++ }
          else if (index === failedIndex) { step.status = 'error'; step.error = data.job.lastError; newActiveStep = index }
          else step.status = 'pending'
        })
        addLog('error', `処理が失敗しました: ${data.job.lastError}`)
        setActiveStep(newActiveStep)
        return updatedSteps
      } else {
        updatedSteps[0].status = 'completed'; completedCount++
        const stepChecks = [
          { flag: data.job.splitCompleted, processing: ['split', 'chunks_created'], index: 1, progressKey: 'processedChunks', totalKey: 'totalChunks' },
          { flag: data.job.analyzeCompleted, processing: ['analyze', 'analyze_'], index: 2, progressKey: 'processedChunks', totalKey: 'totalChunks' },
          { flag: data.job.episodeCompleted, processing: ['episode', 'episode_'], index: 3, progressKey: 'processedChunks', totalKey: 'totalChunks' },
          { flag: data.job.layoutCompleted, processing: ['layout', 'layout_'], index: 4, progressKey: 'processedEpisodes', totalKey: 'totalEpisodes' },
          { flag: data.job.renderCompleted, processing: ['render', 'render_'], index: 5, progressKey: 'renderedPages', totalKey: 'totalPages' },
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
          } else if (check.processing.some(p => data.job.currentStep?.startsWith(p))) {
            updatedSteps[check.index].status = 'processing'
            if (check.index === 4) { // layout step
              const total = data.job.totalEpisodes || 0, processed = data.job.processedEpisodes || 0
              const match = data.job.currentStep?.match(/layout_episode_(\d+)/)
              const currentNum = match ? parseInt(match[1], 10) : DEFAULT_EPISODE_NUMBER
              const processedWithCurrent = processed + (currentNum > processed ? inProgressWeight : 0)
              updatedSteps[check.index].progress = total > 0 ? Math.round((processedWithCurrent / total) * 100) : 0
            } else if (check.index === 5) { // render step
              updatedSteps[check.index].progress = calculateRenderProgress(data.job)
            } else {
              const total = (data.job as any)[check.totalKey], processed = (data.job as any)[check.progressKey]
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
          if (updatedSteps[i].status === 'processing') addLog('info', `${updatedSteps[i].name} を開始しました`)
          else if (updatedSteps[i].status === 'completed') {
            if (isDemoMode && (updatedSteps[i].id === 'analyze' || updatedSteps[i].id === 'episode')) addLog('info', `デモ: ${updatedSteps[i].name} をスキップ（仮完了）しました`)
            else addLog('info', `${updatedSteps[i].name} が完了しました`)
          }
          else if (updatedSteps[i].status === 'error') addLog('error', `${updatedSteps[i].name} でエラーが発生しました`)
        }
      }

      const hints: Partial<Record<HintStep, string>> = {}
      const stepId = data.job.currentStep || ''
      const analyzeMatch = stepId.match(/^analyze_chunk_(\d+)(?:_(retry|done))?$/)
      if (analyzeMatch && !data.job.analyzeCompleted) {
          const idx = Number(analyzeMatch[1]), total = data.job.totalChunks || 0
          hints.analyze = `現在: チャンク ${Math.min(idx + 1, total || idx + 1)} / ${total || '?'} を分析中`
      }
      const layoutMatch = stepId.match(/^layout_episode_(\d+)$/);
      if (layoutMatch && !data.job.layoutCompleted) {
          const ep = Number(layoutMatch[1]);
          setCurrentLayoutEpisode(ep);
          const totalEp = data.job.totalEpisodes || 0;
          hints.layout = `現在: エピソード ${Math.min(ep, totalEp || ep)} / ${totalEp || '?'} をレイアウト中`;
      }
      if ((stepId === 'render' || stepId.startsWith('render_')) && !data.job.renderCompleted) {
          const total = data.job.totalPages || 0, rendered = data.job.renderedPages ?? 0;
          const processingPage = data.job.processingPage, processingEpisode = data.job.processingEpisode;
          if (total > 0) {
              const progressPercent = Math.round((rendered / total) * 100);
              if (processingPage && processingEpisode) hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中 (${rendered}/${total}完了 ${progressPercent}%)`;
              else hints.render = `現在: ${rendered}/${total}ページ完了 (${progressPercent}%)`;
          } else {
              if (processingPage && processingEpisode) hints.render = `現在: EP${processingEpisode} ページ${processingPage}をレンダリング中`;
              else hints.render = `現在: ${rendered}ページ完了`;
          }
      }
      setRuntimeHints(hints)
      setOverallProgress(calculateOverallProgress(data.job, completedCount))
      return updatedSteps
    })

    const statusCompleted = data.job.status === 'completed' || data.job.status === 'complete'
    return statusCompleted || data.job.status === 'failed' ? 'stop' : 'continue'
  }, [lastJobData, addLog, describeStep, isDemoMode, inProgressWeight, EpisodePageDataSchema, normalizationToastShown])

  useEffect(() => {
    if (!jobId) return
    setSteps((prev) => prev.map((step, index) => (index === 0 ? { ...step, status: 'completed' as const } : step)))
    setOverallProgress(Math.round(STEP_PERCENT))
    setActiveStep(1)
    addLog('info', `処理を開始しました。Job ID: ${jobId}`)
    const es = new EventSource(`/api/jobs/${jobId}/events`)
    const handlePayload = (raw: string) => {
      try {
        const data = JSON.parse(raw) as JobData
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
    es.addEventListener('error', (ev) => addLog('warning', 'SSE接続に問題が発生しました。再接続を試行します。', ev))
    return () => { isMountedRef.current = false; es.close() }
  }, [jobId, addLog, updateStepsFromJobData])

  useEffect(() => {
    if (completed) onComplete?.()
  }, [completed, onComplete])

  useEffect(() => {
    if (jobId) return
    setSteps((prev) => { const updated = prev.map((s) => ({...s})); updated[0].status = 'processing'; return updated; })
    setActiveStep(0)
    setOverallProgress(0)
    addLog('info', '準備中: アップロードを開始しています')
  }, [jobId, addLog])

  const episodeProgressCards = useMemo(() => {
    return Object.entries(perEpisodePages).map(([epStr, v]) => ({ ep: Number(epStr), ...v, isCompleted: typeof v.total === 'number' && v.total > 0 && v.planned >= v.total && v.rendered >= v.total, isCurrent: currentLayoutEpisode === Number(epStr), isInProgress: !(typeof v.total === 'number' && v.total > 0 && v.planned >= v.total && v.rendered >= v.total) && v.planned > 0 }))
      .sort((a, b) => {
        const score = (x: any) => x.isCurrent ? 0 : x.isInProgress ? 1 : x.isCompleted ? 3 : 2
        return score(a) - score(b) || a.ep - b.ep
      })
  }, [perEpisodePages, currentLayoutEpisode])

  const hasFailedStep = steps.some((step) => step.status === 'error')
  const failedStep = steps.find((step) => step.status === 'error')

  return (
    <Stack spacing={3}>
      {normalizationToastShown && (<Alert severity="warning" sx={{ position: 'fixed', top: 80, right: 20, zIndex: 1400 }}>安全装置: ページ番号の正規化を適用しました（上限 {_MAX_PAGES} ページ）</Alert>)}
      {hasFailedStep && failedStep && (<Alert severity="error" icon={<Error />} sx={{ mb: 2 }}> <Typography fontWeight="bold">{failedStep.name}でエラーが発生しました。</Typography> {failedStep.error && <Typography variant="body2">{failedStep.error}</Typography>} </Alert>)}

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">処理進捗</Typography>
            {showLogsFlag && <Button size="small" onClick={() => setShowLogs(!showLogs)}>{showLogs ? 'ログを隠す' : 'ログを表示'}</Button>}
          </Stack>

          {modeHint && <Alert severity="info" sx={{ mb: 2 }}>{modeHint}</Alert>}

          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <LinearProgress variant="determinate" value={overallProgress} sx={{ flexGrow: 1 }} />
            <Typography variant="body2" color="text.secondary">{`${Math.round(overallProgress)}%`}</Typography>
          </Stack>

          {jobId && (
            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2">トークン使用量 (入力/出力): {tokenPromptSum.toLocaleString()} / {tokenCompletionSum.toLocaleString()}</Typography>
              <Chip label={completed ? '確定' : '暫定'} color={completed ? 'success' : 'warning'} size="small" />
            </Paper>
          )}
        </CardContent>
      </Card>

      <Stepper activeStep={activeStep} orientation="vertical">
        {steps.map((step, index) => (
          <Step key={step.id}>
            <StepLabel
              StepIconComponent={(props) => {
                const { active, completed, error } = props
                if (error) return <Error color="error" />
                if (completed) return <CheckCircle color="success" />
                if (active) return <HourglassEmpty color="primary" className="animate-spin" />
                return <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'grey.300', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: 'white', fontSize: '0.8rem' }}>{index + 1}</Typography></Box>
              }}
            >
              <Typography>{step.name}</Typography>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="text.secondary">{step.description}</Typography>
              {runtimeHints[step.id as HintStep] && <Typography variant="caption" color="primary">{runtimeHints[step.id as HintStep]}</Typography>}
              {step.status === 'processing' && step.progress !== undefined && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress variant="determinate" value={step.progress} />
                </Box>
              )}
              {step.status === 'error' && step.error && <Alert severity="error" sx={{ mt: 1 }}>{step.error}</Alert>}
            </StepContent>
          </Step>
        ))}
      </Stepper>

      {Object.keys(perEpisodePages).length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>エピソード進捗</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {episodeProgressCards.map(({ ep, planned, rendered, total, normalizedCount, isCompleted, isCurrent }) => {
                const totalPages = total || planned || 1
                const progress = totalPages > 0 ? Math.round((rendered / totalPages) * 100) : 0
                return (
                  <Card key={ep} variant="outlined" sx={{ flexBasis: '150px', flexGrow: 1, borderColor: isCurrent ? 'primary.main' : undefined }}>
                    <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" fontWeight="bold">EP{ep}</Typography>
                        {isCompleted && <CheckCircle color="success" sx={{ fontSize: '1rem' }} />}
                        {normalizedCount > 0 && <Chip label={`N:${normalizedCount}`} size="small" color="warning" sx={{height: '16px', fontSize: '0.6rem'}} />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{rendered} / {totalPages} ページ</Typography>
                      <LinearProgress variant="determinate" value={progress} sx={{ mt: 0.5 }} color={isCompleted ? 'success' : 'primary'} />
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      {showLogsFlag && (
        <Collapse in={showLogs}>
          <Card>
            <CardContent>
              <Typography variant="h6">開発ログ</Typography>
              <Paper variant="outlined" sx={{ mt: 1, p: 1, maxHeight: `${MAX_VISIBLE_LOG_HEIGHT}vh`, overflowY: 'auto' }}>
                {logs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">ログはまだありません</Typography>
                ) : (
                  logs.map((log, index) => (
                    <Alert key={index} severity={log.level} variant="outlined" sx={{ mb: 1, fontSize: '0.8rem' }}>
                      <Typography variant="caption" sx={{ mr: 1 }}>{log.timestamp}</Typography>
                      {log.message}
                    </Alert>
                  ))
                )}
              </Paper>
            </CardContent>
          </Card>
        </Collapse>
      )}
    </Stack>
  )
}

export default memo(ProcessingProgress)
