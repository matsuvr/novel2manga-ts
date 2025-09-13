'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import type { JobWithNovel } from '@/services/job/types'

interface JobDetailsProps {
  jobId: string
}

export function JobDetails({ jobId }: JobDetailsProps) {
  const { status } = useSession()
  const [jobWithNovel, setJobWithNovel] = useState<JobWithNovel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)

  const fetchJobDetails = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}`)

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('ジョブが見つかりません')
        }
        if (response.status === 403) {
          throw new Error('このジョブにアクセスする権限がありません')
        }
        throw new Error('ジョブの詳細取得に失敗しました')
      }

      const data = await response.json()
      setJobWithNovel(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchJobDetails()
    }
  }, [status, fetchJobDetails])

  const handleResume = async () => {
    setResuming(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'ジョブの再開に失敗しました')
      }

      // Refresh job details
      await fetchJobDetails()
    } catch (error) {
      console.error('Resume job error:', error)
      alert(error instanceof Error ? error.message : 'ジョブの再開に失敗しました')
    } finally {
      setResuming(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div className="text-center">読み込み中...</div>
  }

  if (status === 'unauthenticated') {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">ログインが必要です</h2>
        <Link
          href="/portal/api/auth/login"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          ログイン
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">エラー</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4 space-x-2">
              <button
                type="button"
                onClick={fetchJobDetails}
                className="text-sm bg-red-100 text-red-800 rounded-md px-2 py-1 hover:bg-red-200"
              >
                再試行
              </button>
              <Link
                href="/portal/dashboard"
                className="text-sm bg-gray-100 text-gray-800 rounded-md px-2 py-1 hover:bg-gray-200"
              >
                ダッシュボードに戻る
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!jobWithNovel) {
    return <div className="text-center">ジョブが見つかりません</div>
  }

  const { job, novel } = jobWithNovel

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('ja-JP')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {job.jobName || novel?.title || `ジョブ ${job.id.slice(0, 8)}`}
            </h1>
            {novel?.author && <p className="text-sm text-gray-500">著者: {novel.author}</p>}
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
              job.status,
            )}`}
          >
            {getStatusLabel(job.status)}
          </span>
        </div>

        <div className="flex space-x-4">
          <Link
            href="/portal/dashboard"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            ← ダッシュボードに戻る
          </Link>

          {(job.status === 'failed' || job.status === 'paused') && (
            <button
              type="button"
              onClick={handleResume}
              disabled={resuming}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {resuming ? '再開中...' : 'ジョブを再開'}
            </button>
          )}
        </div>
      </div>

      {/* Job Progress */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">進捗状況</h2>

        <div className="space-y-4">
          {/* Step Progress */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { key: 'split', label: 'テキスト分割', completed: job.splitCompleted },
              { key: 'analyze', label: '分析', completed: job.analyzeCompleted },
              { key: 'episode', label: 'エピソード生成', completed: job.episodeCompleted },
              { key: 'layout', label: 'レイアウト', completed: job.layoutCompleted },
              { key: 'render', label: 'レンダリング', completed: job.renderCompleted },
            ].map((step, index) => (
              <div key={step.key} className="text-center">
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm font-medium ${
                    step.completed
                      ? 'bg-green-500 text-white'
                      : job.currentStep === step.key
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {step.completed ? '✓' : index + 1}
                </div>
                <div className="mt-2 text-xs text-gray-600">{step.label}</div>
              </div>
            ))}
          </div>

          {/* Detailed Progress */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            {(job.totalChunks ?? 0) > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700">チャンク処理</div>
                <div className="text-2xl font-bold text-blue-600">
                  {job.processedChunks ?? 0} / {job.totalChunks ?? 0}
                </div>
              </div>
            )}

            {(job.totalEpisodes ?? 0) > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700">エピソード</div>
                <div className="text-2xl font-bold text-green-600">
                  {job.processedEpisodes ?? 0} / {job.totalEpisodes ?? 0}
                </div>
              </div>
            )}

            {(job.totalPages ?? 0) > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700">ページ</div>
                <div className="text-2xl font-bold text-purple-600">
                  {job.renderedPages ?? 0} / {job.totalPages ?? 0}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Information */}
      {job.status === 'failed' && job.lastError && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">エラー情報</h2>
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {job.lastErrorStep && `ステップ: ${job.lastErrorStep}`}
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{job.lastError}</p>
                </div>
                {(job.retryCount ?? 0) > 0 && (
                  <div className="mt-2 text-xs text-red-600">再試行回数: {job.retryCount}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Details */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">詳細情報</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">基本情報</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">ジョブID:</dt>
                <dd className="text-gray-900 font-mono">{job.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">作成日時:</dt>
                <dd className="text-gray-900">{formatDate(job.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">開始日時:</dt>
                <dd className="text-gray-900">{formatDate(job.startedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">完了日時:</dt>
                <dd className="text-gray-900">{formatDate(job.completedAt)}</dd>
              </div>
            </dl>
          </div>

          {novel && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">小説情報</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">タイトル:</dt>
                  <dd className="text-gray-900">{novel.title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">著者:</dt>
                  <dd className="text-gray-900">{novel.author}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">文字数:</dt>
                  <dd className="text-gray-900">{novel.textLength?.toLocaleString()} 文字</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">言語:</dt>
                  <dd className="text-gray-900">{novel.language}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
