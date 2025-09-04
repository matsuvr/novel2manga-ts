'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'
import ResultsDisplay from '@/components/ResultsDisplay'
import TextInputArea from '@/components/TextInputArea'
import { appConfig } from '@/config/app.config'
import type { Episode } from '@/types/database-models'

type ViewMode = 'input' | 'processing' | 'progress' | 'results' | 'redirecting'

async function loadSample(path: string): Promise<string> {
  // public/docs 配下は直接配信されるため優先して利用
  // それ以外のパスのみ API 経由
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
    <button
      type="button"
      onClick={async () => {
        try {
          const text = await loadSample(path)
          onLoad(text)
        } catch (e) {
          console.error(e)
          alert('サンプルの読み込みに失敗しました')
        }
      }}
      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium shadow-sm shadow-blue-500/20 transition hover:shadow-md hover:-translate-y-0.5 active:scale-95"
    >
      📄 {label}
    </button>
  )
}

function RedirectingView({ pendingRedirect }: { pendingRedirect: string }) {
  const _router = useRouter()

  React.useEffect(() => {
    // フォールバック用の自動遷移（3秒後）
    const fallbackTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname !== pendingRedirect) {
        console.log('フォールバック遷移を実行:', pendingRedirect)
        window.location.href = pendingRedirect
      }
    }, 3000)

    return () => clearTimeout(fallbackTimer)
  }, [pendingRedirect])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="apple-card p-8 text-center space-y-3">
        <div className="text-4xl">➡️</div>
        <h3 className="text-xl font-semibold">結果ページへ移動します…</h3>
        <p className="text-gray-600">
          自動的に移動しない場合は
          <a className="text-blue-600 underline ml-1" href={pendingRedirect}>
            こちらをクリック
          </a>
          してください。
        </p>
        <div className="mt-4">
          <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span>3秒後に自動的に移動します</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomeClient() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('input')
  const [novelText, setNovelText] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [novelIdState, setNovelIdState] = useState<string | null>(null)
  const [resumeNovelId, setResumeNovelId] = useState<string>('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SSR/CSRの不一致を避けるため、クエリ依存のフラグはクライアント側で設定
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
      // JSONとしてテキストを送信
      const uploadResponse = await fetch('/api/novel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: novelText }),
      })

      if (!uploadResponse.ok) {
        const errorData = (await uploadResponse.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(errorData.error || 'サーバーエラーが発生しました')
      }

      const uploadData = (await uploadResponse.json().catch(() => ({}))) as {
        uuid?: string
        fileName?: string
      }
      const novelId = uploadData.uuid
      if (!novelId) throw new Error('novelId を取得できませんでした')

      // Validate novelId format (UUID v4)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(novelId)) {
        throw new Error('サーバーから無効なnovelId形式を受信しました')
      }

      setNovelIdState(novelId)
      // アップロード完了後は、novelId付きの進捗URLへ遷移可能に切替
      // 以降の処理は従来通り開始するが、UIは専用ページに委譲する

      const analyzeEndpoint = isDemo ? '/api/analyze?demo=1' : '/api/analyze'
      const analyzeResponse = await fetch(analyzeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chunkSize: appConfig.chunking.defaultChunkSize,
          overlapSize: appConfig.chunking.defaultOverlapSize,
          ...(isDemo ? { mode: 'demo' } : {}),
        }),
      })

      if (!analyzeResponse.ok) {
        const errorData = (await analyzeResponse.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(errorData.error || '分析の開始に失敗しました')
      }

      const analyzeData = (await analyzeResponse.json().catch(() => ({}))) as {
        id?: string
        data?: { jobId?: string }
        jobId?: string
      }
      const jobId = analyzeData.id || analyzeData.data?.jobId || analyzeData.jobId
      if (!jobId) throw new Error('jobId を取得できませんでした')
      setJobId(jobId)

      // 進捗専用ページへ遷移（戻る操作に強いURL設計）
      try {
        const url = `/novel/${encodeURIComponent(novelId)}/progress`
        await router.push(url)
      } catch (e) {
        console.error('進捗ページへの遷移に失敗しました:', e)
        // 遷移失敗時のみ従来の進捗表示にフォールバック
        setViewMode('progress')
      }
    } catch (err) {
      console.error('Process error:', err)
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const handleProcessComplete = useCallback(async () => {
    if (!jobId) return

    // リダイレクト条件を成功時に限定: 直前にサーバ状態を確認
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json().catch(() => ({}))) as {
        job?: { status?: string; renderCompleted?: boolean }
      }
      const status = data?.job?.status
      const isCompleted = status === 'completed' || status === 'complete'
      if (!isCompleted) {
        // 成功状態でなければリダイレクトしない
        setError('処理が完了していないため、結果ページへは移動しません。')
        setIsProcessing(false)
        return
      }
    } catch {
      // 取得に失敗した場合もリダイレクトしない
      setError('現在のジョブ状態を確認できませんでした。')
      setIsProcessing(false)
      return
    }

    // 成功時のみ遷移を実行し、データ取得は結果ページ側のサーバーコンポーネントに任せる
    if (novelIdState && jobId) {
      const url = `/novel/${encodeURIComponent(novelIdState)}/results/${encodeURIComponent(jobId)}`
      setPendingRedirect(url)
      setViewMode('redirecting')

      try {
        // 少し遅延を入れてからリダイレクトを実行（UIの更新を確実にするため）
        setTimeout(async () => {
          try {
            await router.push(url)
            setIsProcessing(false)
          } catch (error) {
            console.error('自動遷移に失敗しました:', error)
            setIsProcessing(false)
          }
        }, 1000) // 1秒後に遷移
      } catch (error) {
        console.error('遷移処理の設定に失敗しました:', error)
        setIsProcessing(false)
      }
      return
    }

    // フォールバック: novelId がない場合のみ、従来の結果表示に切替
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
    // Validate novelId format before sending to server
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: resumeNovelId }),
      })

      if (!resumeResponse.ok) {
        const errorData = (await resumeResponse.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(errorData.error || '再開の開始に失敗しました')
      }

      const resumeData = (await resumeResponse.json().catch(() => ({}))) as {
        jobId?: string
        novelId?: string
        status?: string
        message?: string
      }

      const jobId = resumeData.jobId
      if (!jobId) throw new Error('jobId を取得できませんでした')

      setJobId(jobId)
      setNovelIdState(resumeData.novelId || resumeNovelId)

      // 進捗専用ページへ遷移
      try {
        const url = `/novel/${encodeURIComponent(resumeData.novelId || resumeNovelId)}/progress`
        await router.push(url)
        return
      } catch (e) {
        console.error('進捗ページへの遷移に失敗しました:', e)
        // 遷移失敗時のみ従来の進捗表示にフォールバック
        setViewMode('progress')
      }

      // 既に完了している場合は結果ページへ（上のpushが成功していればそこで処理される）
      if (resumeData.status === 'completed') {
        try {
          await router.push(
            `/novel/${encodeURIComponent(resumeData.novelId || resumeNovelId)}/results/${encodeURIComponent(jobId)}`,
          )
          return
        } catch {
          // フォールバックとして従来の完了ハンドラ
          await handleProcessComplete()
        }
      }
    } catch (err) {
      console.error('Resume error:', err)
      setError(err instanceof Error ? err.message : '再開中にエラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)

  // 完了検知は ProcessingProgress の SSE に一本化（DRY）。

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <header className="modern-header">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">📚</div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Novel to Manga Converter
                </h1>
                <p className="text-sm text-gray-600">小説をマンガの絵コンテに自動変換</p>
              </div>
            </div>
            {viewMode !== 'input' && (
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-3 bg-gray-100 text-gray-700 border border-gray-200 rounded-2xl font-medium shadow-sm shadow-gray-500/10 transition-all duration-300 ease-out hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
              >
                🔄 最初から
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-white rounded-3xl shadow-2xl border border-gray-100/50 border-l-4 border-red-500">
            <div className="p-4">
              <div className="flex items-center">
                <span className="text-red-500 text-xl mr-3">⚠️</span>
                <div>
                  <p className="font-medium text-red-700">エラーが発生しました</p>
                  <p className="text-sm text-gray-600 mt-1">{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'input' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* 再開機能 */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100/50 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <span className="text-2xl mr-2">🔄</span>
                処理の再開
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                以前に処理を開始したnovelIdを入力して、処理を再開できます
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="novelId (UUID形式)"
                  value={resumeNovelId}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onChange={(e) => setResumeNovelId(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => resumeNovelId && handleResume(resumeNovelId)}
                  disabled={!resumeNovelId.trim() || isProcessing}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-medium shadow-sm shadow-green-500/20 transition hover:shadow-md hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  再開
                </button>
              </div>
            </div>

            {/* 新規処理 */}
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100/50 p-6 min-h-[600px] transition-all duration-500 ease-out hover:shadow-3xl hover:-translate-y-1">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <span className="text-2xl mr-2">📝</span>
                新規変換
              </h3>
              <TextInputArea
                value={novelText}
                onChange={setNovelText}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
                maxLength={2000000}
              />
            </div>

            <div className="mt-6 text-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-3">
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
          <div className="max-w-4xl mx-auto">
            <ProcessingProgress
              jobId={jobId}
              onComplete={handleProcessComplete}
              modeHint={
                isDemo
                  ? '本来はLLMで詳細分析を行いますが、デモモードのため処理を簡略化しています（URLに ?demo=1）。'
                  : undefined
              }
              isDemoMode={isDemo}
            />

            {/* 処理開始時の視覚的フィードバック */}
            <div className="mt-8 text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse mb-4">
                <span className="text-4xl">✨</span>
              </div>
              <h3 className="text-xl font-semibold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                AI処理中
              </h3>
              <p className="text-gray-600">
                小説をマンガ形式に変換中です。しばらくお待ちください...
              </p>

              {/* 処理状態の説明 */}
              <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm">ℹ️</span>
                  </div>
                  <div className="text-left">
                    <h4 className="font-medium text-blue-900 mb-1">処理について</h4>
                    <p className="text-sm text-blue-700">
                      長い小説の場合、処理に数分かかることがあります。
                      上記の進捗表示で現在の状況をご確認いただけます。
                    </p>
                    {process.env.NODE_ENV === 'development' && (
                      <p className="text-xs text-blue-600 mt-2">
                        💡 開発環境: 詳細ログは進捗パネルで確認できます
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'redirecting' && pendingRedirect && (
          <RedirectingView pendingRedirect={pendingRedirect} />
        )}

        {viewMode === 'results' && jobId && (
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                変換結果
              </h2>
              <p className="text-gray-600">{episodes.length} 個のエピソードが生成されました</p>
            </div>
            <ResultsDisplay jobId={jobId} episodes={episodes} />
          </div>
        )}
      </main>

      <footer className="modern-header border-t mt-auto">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <p>© 2025 Novel to Manga Converter</p>
            <div className="flex items-center space-x-6">
              <Link href="/help" className="hover:text-blue-600 transition-colors">
                ヘルプ
              </Link>
              <Link href="/privacy" className="hover:text-blue-600 transition-colors">
                プライバシー
              </Link>
              <Link href="/terms" className="hover:text-blue-600 transition-colors">
                利用規約
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
