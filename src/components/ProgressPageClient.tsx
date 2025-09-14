'use client'

import { useRouter } from 'next/navigation'
import React from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'

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
        const data = (await res.json().catch(() => ({}))) as {
          jobId?: string
          status?: string
        }
        if (cancelled) return
        const jid = data.jobId
        if (!jid) throw new Error('jobIdを取得できませんでした')
        setJobId(jid)
        setMessage(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'ジョブの確認に失敗しました')
      }
    }
    void ensureJob()
    return () => {
      cancelled = true
    }
  }, [novelId])

  const handleComplete = React.useCallback(async () => {
    // 完了は結果ページに遷移（最終確認は結果側のサーバで実施）
    if (!jobId) return
    router.replace(`/novel/${encodeURIComponent(novelId)}/results/${encodeURIComponent(jobId)}`)
  }, [jobId, novelId, router])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
          進捗表示（小説ID: {novelId}）
        </h2>
        <p className="text-gray-600 text-sm mt-1">
          このページはURLにnovelIdを含むため、途中で離れても再訪可能です。
        </p>
      </div>

      {error && (
        <div className="apple-card p-4 bg-red-50 border-red-200 border-2 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
          <p className="text-red-600 text-xs mt-1">
            novelIdが正しいかをご確認ください。必要に応じて最初からやり直せます。
          </p>
          <div className="mt-2">
            <a href="/" className="text-blue-600 underline text-sm">
              トップへ戻る
            </a>
          </div>
        </div>
      )}

      {message && (
        <div className="apple-card p-4 bg-blue-50 border-blue-200 border mb-4">
          <p className="text-blue-800 text-sm">{message}</p>
        </div>
      )}

      {!error && !jobId && (
        <div className="apple-card p-6">
          <div className="flex items-center gap-3 text-gray-700">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
            <span className="text-sm">ジョブ情報を取得しています…</span>
          </div>
        </div>
      )}

      {jobId && <ProcessingProgress jobId={jobId} onComplete={handleComplete} />}

      <div className="mt-8 text-center">
        <a href="/" className="text-sm text-gray-600 hover:text-gray-800 underline">
          トップへ戻る
        </a>
      </div>
    </div>
  )
}
