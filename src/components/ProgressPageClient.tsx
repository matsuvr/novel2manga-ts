'use client'

import { useRouter } from 'next/navigation'
import React from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Props = {
  novelId: string
}

export default function ProgressPageClient({ novelId }: Props) {
  const router = useRouter()
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function ensureJob() {
      try {
        setMessage('ジョブを確認/再開しています…')
        const res = await fetch('/api/resume', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ novelId }),
          cache: 'no-store',
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || `Failed to resume for novelId=${novelId}`)
        }
        const data = (await res.json().catch(() => ({}))) as { jobId?: string; status?: string }
        if (cancelled) return
        const jid = data.jobId
        if (!jid) throw new Error('jobIdを取得できませんでした')
        setJobId(jid)
        setMessage(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'ジョブの確認に失敗しました')
      } finally {
        if (!cancelled) {
          setMessage(null)
        }
      }
    }
    void ensureJob()
    return () => {
      cancelled = true
    }
  }, [novelId])

  const handleComplete = React.useCallback(async () => {
    if (!jobId) return
    router.replace(`/novel/${encodeURIComponent(novelId)}/results/${encodeURIComponent(jobId)}`)
  }, [jobId, novelId, router])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <h2 className="mb-1 bg-gradient-to-r from-sky-500 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent">
          進捗表示
        </h2>
        <p className="text-sm text-muted-foreground">小説ID: {novelId}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          このページはURLにnovelIdを含むため、途中で離れても再訪可能です。
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <div className="font-medium">{error}</div>
          <p className="mt-1 text-xs opacity-90">
            novelIdが正しいかをご確認ください。必要に応じて最初からやり直せます。
          </p>
          <div className="mt-2">
            <a href="/" className="underline">
              トップへ戻る
            </a>
          </div>
        </Alert>
      )}

      {message && <Alert className="mb-3">{message}</Alert>}

      {!error && !jobId && (
        <div className="flex items-center justify-center rounded-lg border bg-white p-4 shadow-sm">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24">
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
          <span>ジョブ情報を取得しています…</span>
        </div>
      )}

      {jobId && <ProcessingProgress jobId={jobId} onComplete={handleComplete} />}

      <div className="mt-6 text-center">
        <Button asChild>
          <a href="/">トップへ戻る</a>
        </Button>
      </div>
    </div>
  )
}
