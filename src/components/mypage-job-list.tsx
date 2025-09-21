'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MypageJobSummary } from '@/types/mypage'

interface Props {
  jobs: MypageJobSummary[]
}

type PendingAction =
  | { type: 'resume'; jobId: string }
  | { type: 'deleteNovel'; novelId: string }

interface DeletePayload {
  novelId: string
  confirmationToken: string
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const handleResume = async (jobId: string) => {
    setPendingAction({ type: 'resume', jobId })
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
      setPendingAction(null)
    }
  }

  const handleDelete = async ({ novelId, confirmationToken }: DeletePayload) => {
    setPendingAction({ type: 'deleteNovel', novelId })
    try {
      const res = await fetch(`/api/mypage/novels/${novelId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationToken }),
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('Failed to delete novel', { status: res.status, body })
        alert('削除に失敗しました')
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Novel deletion request failed', { error })
      alert('削除に失敗しました')
    } finally {
      setPendingAction(null)
    }
  }

  const [confirmInput, setConfirmInput] = useState('')
  const [confirmingNovel, setConfirmingNovel] = useState<{ novelId: string; novelTitle: string } | null>(
    null,
  )
  const [previousActiveElement, setPreviousActiveElement] = useState<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const openConfirm = (novelId: string, novelTitle: string) => {
    setPreviousActiveElement(document.activeElement as HTMLElement | null)
    setConfirmingNovel({ novelId, novelTitle })
    setConfirmInput('')
    // prevent background scroll
    document.body.style.overflow = 'hidden'
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const closeConfirm = useCallback(() => {
    setConfirmingNovel(null)
    setConfirmInput('')
    document.body.style.overflow = ''
    // restore focus
    setTimeout(() => previousActiveElement?.focus(), 0)
  }, [previousActiveElement])

  // handle Escape to close modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmingNovel) {
        closeConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmingNovel, closeConfirm])

  if (jobs.length === 0) {
    return (
      <div className="rounded-md border bg-white p-4 text-center text-sm text-muted-foreground">
        ジョブ履歴はありません。
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      {(() => {
        const seenNovels = new Set<string>()
        return jobs.map((job, idx) => {
          const isPrimaryNovelRow = !seenNovels.has(job.novelId)
          if (isPrimaryNovelRow) {
            seenNovels.add(job.novelId)
          }

          const isResumePending = pendingAction?.type === 'resume' && pendingAction.jobId === job.id
          const isDeletePending =
            pendingAction?.type === 'deleteNovel' && pendingAction.novelId === job.novelId

          const expectedConfirmation = job.novelTitle && job.novelTitle.trim().length > 0 ? job.novelTitle : 'DELETE'

          return (
            <div
              key={job.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${idx !== jobs.length - 1 ? 'border-b' : ''}`}
            >
              <div>
                <div className="text-sm font-medium">{job.novelTitle || job.novelId}</div>
                <div className="text-xs text-muted-foreground">Status: {job.status}</div>
              </div>
              <div className="flex items-center gap-2">
                {isPrimaryNovelRow && (
                  <div className="relative">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openConfirm(job.novelId, job.novelTitle)}
                      disabled={pendingAction !== null}
                    >
                      {isDeletePending ? (
                        <LoadingIndicator label="小説を削除中..." />
                      ) : (
                        '小説を削除'
                      )}
                    </Button>
                    {confirmingNovel?.novelId === job.novelId && (
                      <div
                        role="dialog"
                        aria-modal="true"
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                      >
                        <button
                          type="button"
                          aria-label="モーダルを閉じる"
                          className="absolute inset-0 bg-black/40"
                          onClick={closeConfirm}
                        />
                        <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
                          <h3 className="text-lg font-semibold mb-2">削除の確認</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            この操作は元に戻せません。関連するジョブや結果もすべて削除されます。
                            以下の確認テキストを入力して削除を確定してください。
                          </p>
                          <label htmlFor="confirm-input" className="block text-xs text-muted-foreground mb-1">
                            確認テキスト
                          </label>
                          <input
                            id="confirm-input"
                            ref={inputRef}
                            type="text"
                            className="w-full rounded-md border px-3 py-2 mb-4 focus:outline-none focus:ring"
                            placeholder={expectedConfirmation}
                            value={confirmInput}
                            onChange={(e) => setConfirmInput(e.target.value)}
                            aria-label="確認テキスト"
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={closeConfirm}>
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const expected = expectedConfirmation
                                if (confirmInput.trim() !== expected) {
                                  alert('確認テキストが一致しません')
                                  return
                                }
                                const token = confirmInput.trim()
                                closeConfirm()
                                void handleDelete({ novelId: job.novelId, confirmationToken: token })
                              }}
                            >
                              確認して削除
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                    disabled={isResumePending || pendingAction?.type === 'deleteNovel'}
                  >
                    {isResumePending ? <LoadingIndicator label="再開中..." /> : '再開'}
                  </Button>
                )}
              </div>
            </div>
          )
        })
      })()}
    </div>
  )
}
