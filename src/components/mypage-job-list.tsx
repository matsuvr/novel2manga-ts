'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MypageJobSummary } from '@/types/mypage'

interface Props {
  jobs: MypageJobSummary[]
}

export default function MypageJobList({ jobs }: Props) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  // jobs is expected to be a proper array from the parent; keep types simple here

  const handleResume = async (jobId: string) => {
    setLoadingId(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.text()
        console.error('Failed to resume job', { status: res.status, body })
        alert('再開に失敗しました')
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Resume request failed', { error })
      alert('再開に失敗しました')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <ul className="space-y-2">
      {jobs.map((job) => {
        return (
          <li key={job.id} className="border rounded p-3 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {job.novelTitle || job.novelId}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">ジョブID: {job.id}</div>
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    <div>{job.createdAt}</div>
                    <div className="mt-1">{job.status}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  {job.status === 'completed' && (
                    <Link
                      href={`/novel/${encodeURIComponent(job.novelId)}/results/${encodeURIComponent(
                        job.id,
                      )}`}
                      className="text-blue-600 hover:underline text-sm"
                      aria-label={`結果を見る ${job.novelTitle || job.id}`}
                    >
                      結果を見る
                    </Link>
                  )}

                  {job.status === 'processing' && (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/novel/${encodeURIComponent(job.novelId)}/progress`)
                      }
                      className="inline-flex items-center gap-2 text-sm text-gray-700"
                      aria-label={`処理中 ${job.novelTitle || job.id}`}
                    >
                      <span className="w-3 h-3 rounded-full bg-blue-500 animate-ping inline-block" />
                      処理中
                    </button>
                  )}

                  {job.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => handleResume(job.id)}
                      className="text-red-600 hover:underline text-sm disabled:opacity-50"
                      disabled={loadingId === job.id}
                      aria-label={`再開 ${job.novelTitle || job.id}`}
                    >
                      {loadingId === job.id ? '再開中...' : '再開'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
