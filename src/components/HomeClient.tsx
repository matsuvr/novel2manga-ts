'use client'

import Link from 'next/link'
import { useState } from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'
import ResultsDisplay from '@/components/ResultsDisplay'
import TextInputArea from '@/components/TextInputArea'
import type { Episode } from '@/types/manga-models'

type ViewMode = 'input' | 'processing' | 'results'

async function loadSample(path: string): Promise<string> {
  // Next.jsでアプリ直下のdocsは静的配信されないため、API経由で返す
  // もしくはpublic/docsに置く場合は /docs/... で直接fetch可能
  const url = path.startsWith('/docs/')
    ? `/api/docs?path=${encodeURIComponent(path.replace(/^\//, ''))}`
    : path
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

export default function HomeClient() {
  const [viewMode, setViewMode] = useState<ViewMode>('input')
  const [novelText, setNovelText] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const errorData = (await uploadResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || 'サーバーエラーが発生しました')
      }

      const uploadData = (await uploadResponse.json().catch(() => ({}))) as { 
        uuid?: string
        fileName?: string 
      }
      const novelId = uploadData.uuid
      if (!novelId) throw new Error('novelId を取得できませんでした')

      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chunkSize: 5000,
          overlapSize: 500,
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
      const jobId = analyzeData.id || analyzeData.data?.jobId || analyzeData.jobId
      if (!jobId) throw new Error('jobId を取得できませんでした')
      setJobId(jobId)
    } catch (err) {
      console.error('Process error:', err)
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const handleProcessComplete = async () => {
    if (!jobId) return

    try {
      const response = await fetch(`/api/jobs/${jobId}/episodes`)
      if (!response.ok) throw new Error('Failed to fetch episodes')

      const data = (await response.json().catch(() => ({}))) as { episodes?: Episode[] }
      setEpisodes(data.episodes || [])
      setViewMode('results')
      setIsProcessing(false)
    } catch (err) {
      console.error('Error fetching results:', err)
      setError('結果の取得に失敗しました')
      setIsProcessing(false)
    }
  }

  const handleReset = () => {
    setViewMode('input')
    setNovelText('')
    setJobId(null)
    setEpisodes([])
    setError(null)
    setIsProcessing(false)
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
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
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100/50 p-6 min-h-[600px] transition-all duration-500 ease-out hover:shadow-3xl hover:-translate-y-1">
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
                <SampleButton label="空き家の冒険" path="/docs/空き家の冒険.txt" onLoad={setNovelText} />
                <SampleButton label="怪人二十面相" path="/docs/怪人二十面相.txt" onLoad={setNovelText} />
                <SampleButton label="モルグ街の殺人事件" path="/docs/モルグ街の殺人事件.txt" onLoad={setNovelText} />
                <SampleButton label="宮本武蔵 地の巻" path="/docs/宮本武蔵地の巻.txt" onLoad={setNovelText} />
                <SampleButton label="最後の一葉" path="/docs/最後の一葉.txt" onLoad={setNovelText} />
              </div>
            </div>
          </div>
        )}

        {viewMode === 'processing' && (
          <div className="max-w-2xl mx-auto">
            <ProcessingProgress jobId={jobId} onComplete={handleProcessComplete} />

            <div className="mt-8 text-center">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse">
                <span className="text-5xl">✨</span>
              </div>
              <p className="mt-4 text-lg text-gray-600">AIが小説を分析しています...</p>
            </div>
          </div>
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
