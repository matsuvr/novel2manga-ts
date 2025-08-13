'use client'

import { memo, useCallback, useEffect, useState } from 'react'

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
  }
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'error' | 'warning'
  message: string
  data?: unknown
}

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

function ProcessingProgress({ jobId, onComplete, modeHint, isDemoMode }: ProcessingProgressProps) {
  const [steps, setSteps] = useState<ProcessStep[]>(() =>
    INITIAL_STEPS.map((step) => ({ ...step })),
  )
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [overallProgress, setOverallProgress] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(process.env.NODE_ENV === 'development')
  const [lastJobData, setLastJobData] = useState<string>('')
  const [runtimeHints, setRuntimeHints] = useState<Record<string, string>>({})

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
        return [...prev.slice(-49), logEntry]
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
        return null // データに変化がない場合は更新しない
      }

      setLastJobData(jobDataString)
      // 詳細メッセージ
      addLog('info', describeStep(data.job.currentStep))
      if (data.job.lastError) {
        const where = data.job.lastErrorStep ? describeStep(data.job.lastErrorStep) : '処理'
        addLog('error', `${where}に失敗: ${data.job.lastError}`)
      }

      // 状態を直接更新
      setSteps((prevSteps) => {
        const updatedSteps = prevSteps.map((step) => ({ ...step }))
        let currentIndex = -1
        let completedCount = 0

        // Map job status to steps
        if (data.job.status === 'completed') {
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
          const failedIndex = failedStepMap[data.job.currentStep] || 0

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
            if (data.job.totalEpisodes && data.job.processedEpisodes !== undefined) {
              updatedSteps[4].progress = Math.round(
                (data.job.processedEpisodes / data.job.totalEpisodes) * 100,
              )
            }
            currentIndex = 4
          }

          if (data.job.renderCompleted) {
            updatedSteps[5].status = 'completed'
            completedCount++
          } else if (
            data.job.currentStep === 'render' ||
            data.job.currentStep?.startsWith('render_')
          ) {
            updatedSteps[5].status = 'processing'
            if (data.job.totalPages && data.job.renderedPages !== undefined) {
              updatedSteps[5].progress = Math.round(
                (data.job.renderedPages / data.job.totalPages) * 100,
              )
            }
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
          const totalEp = data.job.totalEpisodes || 0
          hints.layout = `現在: エピソード ${Math.min(ep, totalEp || ep)} / ${totalEp || '?'} をレイアウト中`
        }
        if ((stepId === 'render' || stepId.startsWith('render_')) && !data.job.renderCompleted) {
          const done = (data.job.renderedPages ?? 0) + 1
          const total = data.job.totalPages || 0
          hints.render = `現在: ページ ${Math.min(done, total || done)} / ${total || '?'} をレンダリング中`
        }
        setRuntimeHints(hints)

        // 現在のインデックスと進捗を設定
        setCurrentStepIndex(currentIndex)
        setOverallProgress(Math.round((completedCount / INITIAL_STEPS.length) * 100))

        return updatedSteps
      })

      return data.job.status === 'completed' || data.job.status === 'failed' ? 'stop' : 'continue'
    },
    [lastJobData, addLog, onComplete, describeStep, isDemoMode],
  )

  useEffect(() => {
    if (!jobId) return

    // 初期状態を設定（一度だけ）
    setSteps((prev) =>
      prev.map((step, index) => (index === 0 ? { ...step, status: 'completed' as const } : step)),
    )
    setOverallProgress(Math.round((1 / INITIAL_STEPS.length) * 100))
    addLog('info', `処理を開始しました。Job ID: ${jobId}`)

    let pollInterval: NodeJS.Timeout
    let isPolling = true

    const poll = async () => {
      if (!isPolling) return

      try {
        const response = await fetch(`/api/jobs/${jobId}/status`)
        if (!response.ok) {
          throw new Error(`API呼び出しに失敗: ${response.status} ${response.statusText}`)
        }

        const data: JobData = await response.json()
        const result = updateStepsFromJobData(data)

        if (result === 'stop') {
          isPolling = false
          clearInterval(pollInterval)
          addLog('info', 'ポーリングを停止しました')
        } else if (result === null) {
          // データに変化がない場合はログ出力しない
        }
      } catch (error) {
        addLog(
          'error',
          `Job状態の取得に失敗: ${error instanceof Error ? error.message : String(error)}`,
        )
        console.error('Error fetching job status:', error)
      }
    }

    // 最初のAPIコールを少し遅延させる
    const initialTimeout = setTimeout(() => {
      poll()
      pollInterval = setInterval(poll, 3000) // 3秒間隔に変更
    }, 1000)

    return () => {
      isPolling = false
      clearTimeout(initialTimeout)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [jobId, addLog, updateStepsFromJobData])

  // jobIdが未確定でも進捗カードを表示（初期段階からUX向上）
  useEffect(() => {
    if (jobId) return
    setSteps((prev) => {
      const updated = prev.map((s) => ({ ...s }))
      updated[0].status = 'processing'
      return updated
    })
    setOverallProgress(Math.round((0 / INITIAL_STEPS.length) * 100))
    addLog('info', '準備中: アップロードを開始しています')
  }, [jobId, addLog])

  return (
    <div className="space-y-6">
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
                {step.status === 'processing' && runtimeHints[step.id] && (
                  <p className="text-sm text-blue-600 mt-1">{runtimeHints[step.id]}</p>
                )}

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

      {/* 開発環境でのログ表示 */}
      {process.env.NODE_ENV === 'development' && showLogs && (
        <div className="apple-card p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
            開発ログ ({logs.length}/50)
          </h4>
          <div className="space-y-1 max-h-60 overflow-y-auto text-xs">
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
