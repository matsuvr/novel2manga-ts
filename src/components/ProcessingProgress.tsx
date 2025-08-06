'use client'

import { useEffect, useState } from 'react'

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
}

const PROCESS_STEPS: ProcessStep[] = [
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

export default function ProcessingProgress({ jobId, onComplete }: ProcessingProgressProps) {
  const [steps, setSteps] = useState<ProcessStep[]>(PROCESS_STEPS)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [overallProgress, setOverallProgress] = useState(0)

  useEffect(() => {
    if (!jobId) return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/status`)
        if (!response.ok) throw new Error('Failed to fetch job status')

        const data = await response.json()

        // Update steps based on job status
        const updatedSteps = [...PROCESS_STEPS]
        let currentIndex = -1
        let completedCount = 0

        // Map job status to steps
        if (data.job.status === 'completed') {
          updatedSteps.forEach((step) => {
            step.status = 'completed'
            completedCount++
          })
          setOverallProgress(100)
          if (onComplete) onComplete()
          clearInterval(pollInterval)
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
        } else {
          // Processing state
          updatedSteps[0].status = 'completed' // Upload always complete if job exists
          completedCount++

          if (data.job.splitCompleted) {
            updatedSteps[1].status = 'completed'
            completedCount++
          } else if (data.job.currentStep === 'split') {
            updatedSteps[1].status = 'processing'
            updatedSteps[1].progress = (data.job.processedChunks / data.job.totalChunks) * 100
            currentIndex = 1
          }

          if (data.job.analyzeCompleted) {
            updatedSteps[2].status = 'completed'
            completedCount++
          } else if (data.job.currentStep === 'analyze') {
            updatedSteps[2].status = 'processing'
            updatedSteps[2].progress = (data.job.processedChunks / data.job.totalChunks) * 100
            currentIndex = 2
          }

          if (data.job.episodeCompleted) {
            updatedSteps[3].status = 'completed'
            completedCount++
          } else if (data.job.currentStep === 'episode') {
            updatedSteps[3].status = 'processing'
            currentIndex = 3
          }

          if (data.job.layoutCompleted) {
            updatedSteps[4].status = 'completed'
            completedCount++
          } else if (data.job.currentStep === 'layout') {
            updatedSteps[4].status = 'processing'
            updatedSteps[4].progress = (data.job.processedEpisodes / data.job.totalEpisodes) * 100
            currentIndex = 4
          }

          if (data.job.renderCompleted) {
            updatedSteps[5].status = 'completed'
            completedCount++
          } else if (data.job.currentStep === 'render') {
            updatedSteps[5].status = 'processing'
            updatedSteps[5].progress = (data.job.renderedPages / data.job.totalPages) * 100
            currentIndex = 5
          }
        }

        setSteps(updatedSteps)
        setCurrentStepIndex(currentIndex)
        setOverallProgress((completedCount / PROCESS_STEPS.length) * 100)
      } catch (error) {
        console.error('Error fetching job status:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [jobId, onComplete])

  if (!jobId) {
    return null
  }

  return (
    <div className="apple-card p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold gradient-text mb-2">処理進捗</h3>
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
                className={`progress-step-modern ${
                  step.status === 'completed'
                    ? 'progress-step-completed'
                    : step.status === 'processing'
                      ? 'progress-step-active'
                      : step.status === 'error'
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                        : 'progress-step-pending'
                }`}
              >
                {step.status === 'completed' ? (
                  '✓'
                ) : step.status === 'processing' ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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

              {step.status === 'processing' && step.progress !== undefined && (
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300"
                    style={{ width: `${step.progress}%` }}
                  />
                </div>
              )}

              {step.status === 'error' && step.error && (
                <p className="text-sm text-red-500 mt-2">{step.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
