'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { JobWithNovel } from '@/services/job/types'

interface JobCardProps {
  jobWithNovel: JobWithNovel
  onJobUpdate: () => void
}

export function JobCard({ jobWithNovel, onJobUpdate }: JobCardProps) {
  const { job, novel } = jobWithNovel
  const [resuming, setResuming] = useState(false)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'paused':
        return 'bg-yellow-100 text-yellow-800'
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '待機中'
      case 'processing':
        return '処理中'
      case 'completed':
        return '完了'
      case 'failed':
        return '失敗'
      case 'paused':
        return '一時停止'
      default:
        return status
    }
  }

  const getStepLabel = (step: string) => {
    switch (step) {
      case 'initialized':
        return '初期化'
      case 'split':
        return 'テキスト分割'
      case 'analyze':
        return '分析'
      case 'episode':
        return 'エピソード生成'
      case 'layout':
        return 'レイアウト'
      case 'render':
        return 'レンダリング'
      case 'complete':
        return '完了'
      default:
        return step
    }
  }

  const calculateProgress = () => {
    if (job.status === 'completed') return 100
    if (job.status === 'failed' || job.status === 'pending') return 0

    // Calculate progress based on completed steps and current progress
    let progress = 0
    const stepWeight = 20 // Each step is worth 20%

    if (job.splitCompleted) progress += stepWeight
    if (job.analyzeCompleted) progress += stepWeight
    if (job.episodeCompleted) progress += stepWeight
    if (job.layoutCompleted) progress += stepWeight
    if (job.renderCompleted) progress += stepWeight

    // Add partial progress for current step
    if (job.status === 'processing') {
      const currentStepProgress = getCurrentStepProgress()
      progress += currentStepProgress * stepWeight
    }

    return Math.min(progress, 100)
  }

  const getCurrentStepProgress = () => {
    const totalChunks = job.totalChunks ?? 0
    const processedChunks = job.processedChunks ?? 0
    const totalEpisodes = job.totalEpisodes ?? 0
    const processedEpisodes = job.processedEpisodes ?? 0
    const totalPages = job.totalPages ?? 0
    const renderedPages = job.renderedPages ?? 0
    switch (job.currentStep) {
      case 'split':
        return totalChunks > 0 ? processedChunks / totalChunks : 0
      case 'analyze':
        return totalChunks > 0 ? processedChunks / totalChunks : 0
      case 'episode':
        return totalEpisodes > 0 ? processedEpisodes / totalEpisodes : 0
      case 'layout':
        return totalEpisodes > 0 ? processedEpisodes / totalEpisodes : 0
      case 'render':
        return totalPages > 0 ? renderedPages / totalPages : 0
      default:
        return 0
    }
  }

  const handleResume = async () => {
    setResuming(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}/resume`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'ジョブの再開に失敗しました')
      }

      onJobUpdate()
    } catch (error) {
      console.error('Resume job error:', error)
      alert(error instanceof Error ? error.message : 'ジョブの再開に失敗しました')
    } finally {
      setResuming(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const progress = calculateProgress()

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {job.jobName || novel?.title || `ジョブ ${job.id.slice(0, 8)}`}
            </h3>
            {novel?.author && (
              <p className="text-sm text-gray-500 truncate">著者: {novel.author}</p>
            )}
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
              job.status,
            )}`}
          >
            {getStatusLabel(job.status)}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{getStepLabel(job.currentStep)}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                job.status === 'completed'
                  ? 'bg-green-500'
                  : job.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Job Details */}
        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <div className="flex justify-between">
            <span>作成日時:</span>
            <span>{formatDate(job.createdAt)}</span>
          </div>
          {job.completedAt && (
            <div className="flex justify-between">
              <span>完了日時:</span>
              <span>{formatDate(job.completedAt)}</span>
            </div>
          )}
          {(job.totalPages ?? 0) > 0 && (
            <div className="flex justify-between">
              <span>ページ数:</span>
              <span>
                {job.renderedPages ?? 0} / {job.totalPages ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {job.status === 'failed' && job.lastError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">
              <span className="font-medium">エラー:</span> {job.lastError}
            </p>
            {job.lastErrorStep && (
              <p className="text-xs text-red-600 mt-1">
                ステップ: {getStepLabel(job.lastErrorStep)}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <Link
            href={`/portal/jobs/${job.id}`}
            className="flex-1 bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-center"
          >
            詳細を見る
          </Link>

          {(job.status === 'failed' || job.status === 'paused') && (
            <button
              type="button"
              onClick={handleResume}
              disabled={resuming}
              className="flex-1 bg-blue-600 py-2 px-3 border border-transparent rounded-md shadow-sm text-sm leading-4 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resuming ? '再開中...' : '再開'}
            </button>
          )}

          {job.status === 'completed' && job.rendersDirPath && (job.totalPages ?? 0) > 0 && (
            <Link
              href={`/portal/jobs/${job.id}/download`}
              className="flex-1 bg-green-600 py-2 px-3 border border-transparent rounded-md shadow-sm text-sm leading-4 font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-center"
            >
              ダウンロード
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
