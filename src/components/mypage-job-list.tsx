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
      {jobs.map((job) => (
        <li key={job.id} className="flex items-center justify-between border p-2 rounded">
          <span className="font-medium">{job.novelTitle || job.novelId}</span>
          {job.status === 'completed' && (
            <Link href={`/results/${job.id}`} className="text-blue-600 hover:underline">
              結果を見る
            </Link>
          )}
          {job.status === 'failed' && (
            <button
              type="button"
              onClick={() => handleResume(job.id)}
              className="text-red-600 hover:underline disabled:opacity-50"
              disabled={loadingId === job.id}
            >
              {loadingId === job.id ? '再開中...' : '再開'}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
