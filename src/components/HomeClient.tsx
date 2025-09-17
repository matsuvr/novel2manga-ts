'use client'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import React, { useCallback, useState } from 'react'
import { RotateCcw, TriangleAlert } from '@/components/icons'
import ProcessingProgress from '@/components/ProcessingProgress'
import ResultsDisplay from '@/components/ResultsDisplay'
import TextInputArea from '@/components/TextInputArea'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { appConfig } from '@/config/app.config'
import type { Episode } from '@/types/database-models'
import { isRenderCompletelyDone } from '@/utils/completion'

type ViewMode = 'input' | 'processing' | 'progress' | 'results' | 'redirecting'

async function loadSample(path: string): Promise<string> {
  const url = path.startsWith('/docs/')
    ? path // public/docs 直配信
    : `/api/docs?path=${encodeURIComponent(path.replace(/^\//, ''))}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('サンプルの読み込みに失敗しました')
  return res.text()
}

function SampleButton({
  label,
  path,
  onLoad,
}: {
  label: string
  path: string
  onLoad: (text: string) => void
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          const text = await loadSample(path)
          onLoad(text)
        } catch (e) {
          console.error(e)
          alert('サンプルの読み込みに失敗しました')
        }
      }}
    >
      {label}
    </Button>
  )
}

function RedirectingView({ pendingRedirect }: { pendingRedirect: string }) {
  const _router = useRouter()

  React.useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname !== pendingRedirect) {
        window.location.href = pendingRedirect
      }
    }, 3000)

    return () => clearTimeout(fallbackTimer)
  }, [pendingRedirect])

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <div className="rounded-xl border bg-white p-6 shadow">
        <div className="mb-2 text-5xl">➡️</div>
        <h3 className="mb-1 text-xl font-semibold">結果ページへ移動します…</h3>
        <p className="text-sm text-muted-foreground">
          自動的に移動しない場合は
          <a className="mx-1 underline" href={pendingRedirect}>
            こちらをクリック
          </a>
          してください。
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-muted-foreground">
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
          <span className="text-xs">3秒後に自動的に移動します</span>
        </div>
      </div>
    </div>
  )
}

export default function HomeClient() {
  const router = useRouter()
  const { status } = useSession()
  const [viewMode, setViewMode] = useState<ViewMode>('input')
  const [novelText, setNovelText] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [novelIdState, setNovelIdState] = useState<string | null>(null)
  const [resumeNovelId, setResumeNovelId] = useState<string>('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(false)

  React.useEffect(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const demo = new URLSearchParams(search).get('demo') === '1'
      setIsDemo(demo)
    } catch {
      setIsDemo(false)
    }
  }, [])

  const handleSubmit = async () => {
    if (!novelText.trim()) return
    setIsProcessing(true)
    setError(null)
    setViewMode('processing')
    try {
      const uploadResponse = await fetch('/api/novel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: novelText }),
      })
      if (!uploadResponse.ok) {
        const errorData = (await uploadResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || 'サーバーエラーが発生しました')
      }
      const uploadData = (await uploadResponse.json().catch(() => ({}))) as { uuid?: string }
      const novelId = uploadData.uuid
      if (!novelId) throw new Error('novelId を取得できませんでした')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(novelId)) {
        throw new Error('サーバーから無効なnovelId形式を受信しました')
      }
      setNovelIdState(novelId)
      const analyzeEndpoint = isDemo ? '/api/analyze?demo=1' : '/api/analyze'
      const analyzeResponse = await fetch(analyzeEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chunkSize: appConfig.chunking.defaultChunkSize,
          overlapSize: appConfig.chunking.defaultOverlapSize,
          ...(isDemo ? { mode: 'demo' } : {}),
        }),
      })
      if (!analyzeResponse.ok) {
        const errorData = (await analyzeResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || '分析の開始に失敗しました')
      }
      const analyzeData = (await analyzeResponse.json().catch(() => ({}))) as {
        id?: string
        data?: { jobId?: string }
        jobId?: string
      }
      const newJobId = analyzeData.id || analyzeData.data?.jobId || analyzeData.jobId
      if (!newJobId) throw new Error('jobId を取得できませんでした')
      setJobId(newJobId)
      await router.push(`/novel/${encodeURIComponent(novelId)}/progress`)
    } catch (err) {
      console.error('Process error:', err)
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const handleProcessComplete = useCallback(async () => {
    if (!jobId) return
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json().catch(() => ({}))) as { job?: unknown }
      const strictlyDone = isRenderCompletelyDone(
        (data?.job ?? null) as Parameters<typeof isRenderCompletelyDone>[0],
      )
      if (!strictlyDone) {
        setError('処理が完了していないため、結果ページへは移動しません。')
        setIsProcessing(false)
        return
      }
    } catch {
      setError('現在のジョブ状態を確認できませんでした。')
      setIsProcessing(false)
      return
    }
    if (novelIdState && jobId) {
      const url = `/novel/${encodeURIComponent(novelIdState)}/results/${encodeURIComponent(jobId)}`
      setPendingRedirect(url)
      setViewMode('redirecting')
      setTimeout(() => {
        ;(async () => {
          try {
            await router.push(url)
          } catch (error: unknown) {
            console.error('自動遷移に失敗しました:', error)
            setIsProcessing(false)
          }
        })()
      }, 1000)
      return
    }
    try {
      const response = await fetch(`/api/jobs/${jobId}/episodes`)
      if (!response.ok) throw new Error('Failed to fetch episodes')
      const data = (await response.json().catch(() => ({}))) as { episodes?: Episode[] }
      setEpisodes(data.episodes || [])
      setViewMode('results')
    } catch (err) {
      console.error('Error fetching results:', err)
      setError('結果の取得に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }, [jobId, novelIdState, router])

  const handleReset = () => {
    setViewMode('input')
    setNovelText('')
    setJobId(null)
    setNovelIdState(null)
    setResumeNovelId('')
    setEpisodes([])
    setError(null)
    setIsProcessing(false)
  }

  const handleResume = async (resumeNovelId: string) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resumeNovelId)
    ) {
      setError('無効なnovelId形式です。有効なUUIDを入力してください。')
      return
    }
    setIsProcessing(true)
    setError(null)
    setViewMode('progress')
    try {
      const resumeResponse = await fetch('/api/resume', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: resumeNovelId }),
      })
      if (!resumeResponse.ok) {
        const errorData = (await resumeResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || '再開の開始に失敗しました')
      }
      const resumeData = (await resumeResponse.json().catch(() => ({}))) as {
        jobId?: string
        novelId?: string
        status?: string
      }
      if (!resumeData.jobId) throw new Error('jobId を取得できませんでした')
      setJobId(resumeData.jobId)
      setNovelIdState(resumeData.novelId || resumeNovelId)
      const targetNovelId = resumeData.novelId || resumeNovelId
      if (resumeData.status === 'completed') {
        await router.push(
          `/novel/${encodeURIComponent(targetNovelId)}/results/${encodeURIComponent(resumeData.jobId)}`,
        )
      } else {
        await router.push(`/novel/${encodeURIComponent(targetNovelId)}/progress`)
      }
    } catch (err) {
      console.error('Resume error:', err)
      setError(err instanceof Error ? err.message : '再開中にエラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)

  return (
    <div className="min-h-[100vh] bg-gradient-to-br from-indigo-500 to-purple-700 py-4">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-4 text-center text-white">
          <div className="mb-2 flex items-center justify-center gap-2">
            <div className="text-4xl">📚</div>
            <div className="text-left">
              <h1 className="bg-gradient-to-r from-pink-300 to-sky-300 bg-clip-text text-2xl font-bold text-transparent">
                Novel to Manga Converter
              </h1>
              <p className="text-sm opacity-80">小説をマンガの絵コンテに自動変換</p>
            </div>
            {status === 'loading' && (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
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
            )}
          </div>
          {viewMode !== 'input' && (
            <Button onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" /> 最初から
            </Button>
          )}
        </div>

        <div className="rounded-2xl bg-white/95 p-4 shadow-lg">
          {error && (
            <Alert variant="destructive" className="mb-3">
              <TriangleAlert className="mr-2 inline h-4 w-4" />
              {error}
            </Alert>
          )}

          {viewMode === 'input' && (
            <div className="space-y-4">
              <Card>
                <CardContent>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-2xl">🔄</span>
                    <div className="text-lg font-semibold">処理の再開</div>
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    以前に処理を開始したnovelIdを入力して、処理を再開できます
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="novelId (UUID形式)"
                      value={resumeNovelId}
                      onChange={(e) => setResumeNovelId(e.target.value)}
                    />
                    <Button
                      onClick={() => resumeNovelId && handleResume(resumeNovelId)}
                      disabled={!resumeNovelId.trim() || isProcessing}
                    >
                      再開
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <TextInputArea
                value={novelText}
                onChange={setNovelText}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
                maxLength={2000000}
              />

              <div className="text-center">
                <div className="mb-2 text-xs text-muted-foreground">
                  またはサンプルテキストを試す:
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <SampleButton
                    label="空き家の冒険"
                    path="/docs/空き家の冒険.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="怪人二十面相"
                    path="/docs/怪人二十面相.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="モルグ街の殺人事件"
                    path="/docs/モルグ街の殺人事件.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="宮本武蔵 地の巻"
                    path="/docs/宮本武蔵地の巻.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="最後の一葉"
                    path="/docs/最後の一葉.txt"
                    onLoad={setNovelText}
                  />
                </div>
              </div>
            </div>
          )}

          {(viewMode === 'processing' || viewMode === 'progress') && (
            <div className="mx-auto max-w-3xl">
              <ProcessingProgress
                jobId={jobId}
                onComplete={handleProcessComplete}
                modeHint={isDemo ? '...' : undefined}
                isDemoMode={isDemo}
              />
            </div>
          )}

          {viewMode === 'redirecting' && pendingRedirect && (
            <RedirectingView pendingRedirect={pendingRedirect} />
          )}

          {viewMode === 'results' && jobId && <ResultsDisplay jobId={jobId} episodes={episodes} />}
        </div>
      </div>
    </div>
  )
}
