'use client'

import { useState } from 'react'
import type { Episode } from '@/types/database-models'

interface ResultsDisplayProps {
  jobId: string
  episodes: Episode[]
}

export default function ResultsDisplay({ jobId, episodes }: ResultsDisplayProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(episodes[0] || null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'images_zip'>('pdf')

  const handleExport = async () => {
    if (!jobId) return

    setIsExporting(true)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          format: exportFormat,
          episodeNumbers: selectedEpisode
            ? [selectedEpisode.episodeNumber]
            : episodes.map((ep) => ep.episodeNumber),
        }),
      })

      if (!response.ok) throw new Error('Export failed')

      const data = await response.json() as { downloadUrl?: string }

      // Download the file
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank')
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  const handleViewEpisode = (episodeNumber: number) => {
    // Open preview in new tab
    window.open(`/api/render/${episodeNumber}/1`, '_blank')
  }

  if (!episodes || episodes.length === 0) {
    return (
      <div className="apple-card p-12 text-center">
        <p className="text-gray-500">エピソードが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Export Controls */}
      <div className="apple-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold gradient-text">エクスポート設定</h3>
          <div className="flex items-center space-x-4">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'images_zip')}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              disabled={isExporting}
            >
              <option value="pdf">PDF形式</option>
              <option value="images_zip">画像ZIP形式</option>
            </select>
            <button type="button" onClick={handleExport} disabled={isExporting} className="btn-modern text-sm">
              {isExporting ? (
                <span className="flex items-center space-x-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>エクスポート中...</span>
                </span>
              ) : (
                <span className="flex items-center space-x-2">
                  <span>💾</span>
                  <span>全エピソードをエクスポート</span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Episodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {episodes.map((episode) => (
          <button
            key={episode.id}
            type="button"
            className={`apple-card p-6 cursor-pointer transition-all glow-effect text-left w-full ${
              selectedEpisode?.id === episode.id
                ? 'ring-2 ring-blue-500 scale-[1.02]'
                : 'hover:scale-[1.02]'
            }`}
            onClick={() => setSelectedEpisode(episode)}
          >
            {/* Episode Thumbnail */}
            <div className="aspect-[3/4] bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl mb-4 flex items-center justify-center">
              <div className="text-center">
                <p className="text-6xl mb-2">📖</p>
                <p className="text-2xl font-bold text-gray-700">Episode {episode.episodeNumber}</p>
              </div>
            </div>

            {/* Episode Info */}
            <div className="space-y-2">
              <h4 className="font-semibold text-lg">
                {episode.title || `エピソード ${episode.episodeNumber}`}
              </h4>
              {episode.summary && (
                <p className="text-sm text-gray-600 line-clamp-3">{episode.summary}</p>
              )}
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>📄 {episode.estimatedPages} ページ</span>
                <span>🎯 信頼度 {Math.round(episode.confidence * 100)}%</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex space-x-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleViewEpisode(episode.episodeNumber)
                }}
                className="flex-1 btn-secondary text-sm"
              >
                👁️ プレビュー
              </button>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation()
                  setSelectedEpisode(episode)
                  setIsExporting(true)
                  try {
                    const response = await fetch('/api/export', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        jobId,
                        format: exportFormat,
                        episodeNumbers: [episode.episodeNumber],
                      }),
                    })

                    if (!response.ok) throw new Error('Export failed')

                    const data = await response.json() as { downloadUrl?: string }

                    if (data.downloadUrl) {
                      window.open(data.downloadUrl, '_blank')
                    }
                  } catch (error) {
                    console.error('Export error:', error)
                    alert('エクスポートに失敗しました')
                  } finally {
                    setIsExporting(false)
                  }
                }}
                disabled={isExporting}
                className="flex-1 btn-secondary text-sm"
              >
                💾 個別エクスポート
              </button>
            </div>
          </button>
        ))}
      </div>

      {/* Selected Episode Details */}
      {selectedEpisode && (
        <div className="apple-card p-6">
          <h3 className="text-xl font-semibold gradient-text mb-4">
            {selectedEpisode.title || `エピソード ${selectedEpisode.episodeNumber}`} の詳細
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">開始位置</p>
              <p className="font-medium">
                チャンク {selectedEpisode.startChunk} (文字位置: {selectedEpisode.startCharIndex})
              </p>
            </div>
            <div>
              <p className="text-gray-500">終了位置</p>
              <p className="font-medium">
                チャンク {selectedEpisode.endChunk} (文字位置: {selectedEpisode.endCharIndex})
              </p>
            </div>
            <div>
              <p className="text-gray-500">推定ページ数</p>
              <p className="font-medium">{selectedEpisode.estimatedPages} ページ</p>
            </div>
            <div>
              <p className="text-gray-500">信頼度</p>
              <p className="font-medium">{Math.round(selectedEpisode.confidence * 100)}%</p>
            </div>
          </div>
          {selectedEpisode.summary && (
            <div className="mt-4">
              <p className="text-gray-500 text-sm mb-2">あらすじ</p>
              <p className="text-gray-700">{selectedEpisode.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
