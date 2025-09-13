'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import type { JobWithNovel } from '@/services/job/types'
import { JobCard } from './JobCard'
import { JobFilters } from './JobFilters'
import { Pagination } from './Pagination'

interface JobsResponse {
  data: JobWithNovel[]
  metadata: {
    limit: number
    offset: number
    status?: string
    timestamp: string
  }
}

export function DashboardContent() {
  const { status } = useSession()
  const [jobs, setJobs] = useState<JobWithNovel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    status: '',
    limit: 12,
    offset: 0,
  })
  const [totalJobs, setTotalJobs] = useState(0)

  const fetchJobs = useCallback(async () => {
    if (status !== 'authenticated') return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: filters.limit.toString(),
        offset: filters.offset.toString(),
      })

      if (filters.status) {
        params.append('status', filters.status)
      }

      const response = await fetch(`/api/jobs?${params}`)

      if (!response.ok) {
        throw new Error('ジョブの取得に失敗しました')
      }

      const data: JobsResponse = await response.json()
      setJobs(data.data)

      // Note: API doesn't return total count yet, so we estimate based on results
      setTotalJobs(
        data.data.length === filters.limit
          ? filters.offset + filters.limit + 1
          : filters.offset + data.data.length,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [status, filters.limit, filters.offset, filters.status])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, offset: 0 }))
  }

  const handlePageChange = (newOffset: number) => {
    setFilters((prev) => ({ ...prev, offset: newOffset }))
  }

  const handleJobUpdate = () => {
    // Refresh jobs when a job is updated (e.g., resumed)
    fetchJobs()
  }

  if (status === 'loading') {
    return <div className="text-center">読み込み中...</div>
  }

  if (status === 'unauthenticated') {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">ログインが必要です</h2>
        <p className="text-gray-600 mb-6">ダッシュボードにアクセスするにはログインしてください。</p>
        <a
          href="/portal/auth/signin"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          ログイン
        </a>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">エラー</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={fetchJobs}
                className="text-sm bg-red-100 text-red-800 rounded-md px-2 py-1 hover:bg-red-200"
              >
                再試行
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <JobFilters currentFilters={filters} onFilterChange={handleFilterChange} loading={loading} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
            <div key={key} className="bg-white shadow rounded-lg p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-2 bg-gray-200 rounded mb-4"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">ジョブがありません</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filters.status
              ? `${getStatusLabel(filters.status)}のジョブはありません。`
              : '新しい小説をアップロードして漫画変換を開始しましょう。'}
          </p>
          {!filters.status && (
            <div className="mt-6">
              <a
                href="/upload"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg
                  className="-ml-1 mr-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                小説をアップロード
              </a>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((jobWithNovel) => (
              <JobCard
                key={jobWithNovel.job.id}
                jobWithNovel={jobWithNovel}
                onJobUpdate={handleJobUpdate}
              />
            ))}
          </div>

          <Pagination
            currentOffset={filters.offset}
            limit={filters.limit}
            totalItems={totalJobs}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  )
}

function getStatusLabel(status: string): string {
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
