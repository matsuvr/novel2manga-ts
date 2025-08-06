'use client'

import { useState } from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'
import ResultsDisplay from '@/components/ResultsDisplay'
import TextInputArea from '@/components/TextInputArea'
import type { Episode } from '@/types/episode'

type ViewMode = 'input' | 'processing' | 'results'

export default function Home() {
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
      // Create a Blob from the text
      const blob = new Blob([novelText], { type: 'text/plain' })
      const file = new File([blob], 'novel.txt', { type: 'text/plain' })

      // Upload the novel
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', 'Untitled Novel')

      const uploadResponse = await fetch('/api/novel', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error || 'アップロードに失敗しました')
      }

      const uploadData = await uploadResponse.json()
      const novelId = uploadData.novelId

      // Start analysis job
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
        const errorData = await analyzeResponse.json()
        throw new Error(errorData.error || '分析の開始に失敗しました')
      }

      const analyzeData = await analyzeResponse.json()
      setJobId(analyzeData.jobId)
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
      // Fetch episodes for the completed job
      const response = await fetch(`/api/jobs/${jobId}/episodes`)
      if (!response.ok) throw new Error('Failed to fetch episodes')

      const data = await response.json()
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {/* Header */}
      <header className="modern-header">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">📚</div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">Novel to Manga Converter</h1>
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

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Error Alert */}
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

        {/* View Modes */}
        {viewMode === 'input' && (
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100/50 p-6 min-h-[600px] transition-all duration-500 ease-out hover:shadow-3xl hover:-translate-y-1">
              <TextInputArea
                value={novelText}
                onChange={setNovelText}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
                maxLength={100000}
              />
            </div>

            {/* Sample Text Button */}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setNovelText(`吾輩は猫である。名前はまだ無い。
どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。この書生というのは時々我々を捕えて煮て食うという話である。しかしその当時は何という考もなかったから別段恐しいとも思わなかった。ただ彼の掌に載せられてスーと持ち上げられた時何だかフワフワした感じがあったばかりである。

掌の上で少し落ちついて書生の顔を見たのがいわゆる人間というものの見始であろう。この時妙なものだと思った感じが今でも残っている。第一毛をもって装飾されべきはずの顔がつるつるしてまるで薬缶だ。その後猫にもだいぶ逢ったがこんな片輪には一度も出会わした事がない。のみならず顔の真中があまりに突起している。そうしてその穴の中から時々ぷうぷうと煙を吹く。どうも咽せぽくて実に弱った。これが人間の飲む煙草というものである事はようやくこの頃知った。`)
                }}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-semibold shadow-lg shadow-blue-500/25 transition-all duration-300 ease-out hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 hover:scale-105 active:scale-95"
              >
                📝 サンプルテキストを使用
              </button>
            </div>
          </div>
        )}

        {viewMode === 'processing' && (
          <div className="max-w-2xl mx-auto">
            <ProcessingProgress jobId={jobId} onComplete={handleProcessComplete} />

            {/* Processing Animation */}
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
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">変換結果</h2>
              <p className="text-gray-600">{episodes.length} 個のエピソードが生成されました</p>
            </div>
            <ResultsDisplay jobId={jobId} episodes={episodes} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="modern-header border-t mt-auto">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <p>© 2025 Novel to Manga Converter</p>
            <div className="flex items-center space-x-6">
              <a href="#" className="hover:text-blue-600 transition-colors">
                ヘルプ
              </a>
              <a href="#" className="hover:text-blue-600 transition-colors">
                プライバシー
              </a>
              <a href="#" className="hover:text-blue-600 transition-colors">
                利用規約
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
