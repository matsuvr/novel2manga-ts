'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MypageJobSummary } from '@/types/mypage'

interface Props {
  jobs: MypageJobSummary[]
}

function LoadingIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        ></path>
      </svg>
      {label}
    </span>
  )
}

export default function MypageJobList({ jobs }: Props) {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<{ jobId: string; type: 'resume' | 'delete' } | null>(
    null,
  )

  const startAction = (jobId: string, type: 'resume' | 'delete') => {
    setPendingAction({ jobId, type })
  }

  const clearAction = () => {
    setPendingAction(null)
  }

  const handleResume = async (jobId: string) => {
    startAction(jobId, 'resume')
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
      clearAction()
    }
  }

  const handleDelete = async (job: MypageJobSummary) => {
    const label = job.novelTitle ? `「${job.novelTitle}」` : 'この小説'
    const confirmed = window.confirm(
      `${label}と変換結果を完全に削除します。復元できません。本当に削除しますか？`,
    )
    if (!confirmed) {
      return
    }

    startAction(job.id, 'delete')
    try {
      const res = await fetch(`/api/mypage/jobs/${job.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.text()
        console.error('Failed to delete job', { status: res.status, body })
        alert('削除に失敗しました')
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Job deletion request failed', { error })
      alert('削除に失敗しました')
    } finally {
      clearAction()
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-md border bg-white p-4 text-center text-sm text-muted-foreground">
        ジョブ履歴はありません。
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      {jobs.map((job, idx) => (
        <div
          key={job.id}
          className={`flex items-center justify-between gap-3 px-4 py-3 ${idx !== jobs.length - 1 ? 'border-b' : ''}`}
        >
          <div>
            <div className="text-sm font-medium">{job.novelTitle || job.novelId}</div>
            <div className="text-xs text-muted-foreground">Status: {job.status}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(job)}
              disabled={pendingAction?.jobId === job.id}
            >
              {pendingAction?.jobId === job.id && pendingAction.type === 'delete' ? (
                <LoadingIndicator label="削除中..." />
              ) : (
                '削除'
              )}
            </Button>
            {job.status === 'completed' &&
              (job.novelId ? (
                <Button asChild size="sm">
                  <Link href={`/novel/${job.novelId}/results/${job.id}`}>結果を見る</Link>
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground">結果を見る</div>
              ))}
            {job.status === 'failed' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleResume(job.id)}
                disabled={pendingAction?.jobId === job.id}
              >
                {pendingAction?.jobId === job.id && pendingAction.type === 'resume' ? (
                  <LoadingIndicator label="再開中..." />
                ) : (
                  '再開'
                )}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
