'use client'

import { useEffect, useRef, useState } from 'react'
import type { Episode } from '@/types/database-models'

interface TokenUsage {
  agentName: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  stepName?: string
  chunkIndex?: number
  episodeNumber?: number
  createdAt: string
}

interface ResultsDisplayProps {
  jobId: string
  episodes: Episode[]
}

export default function ResultsDisplay({ jobId, episodes }: ResultsDisplayProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'images_zip'>('pdf')
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([])
  const [isLoadingTokenUsage, setIsLoadingTokenUsage] = useState(false)

  // Ref to track component mount state for proper cleanup
  const isMountedRef = useRef(true)

  // トークン使用量を取得
  useEffect(() => {
    const fetchTokenUsage = async () => {
      if (!jobId) return

      // Check if component is still mounted before proceeding
      if (!isMountedRef.current) return

      setIsLoadingTokenUsage(true)
      try {
        const response = await fetch(`/api/jobs/${jobId}/token-usage`)
        if (response.ok) {
          const data = (await response.json()) as { tokenUsage?: TokenUsage[] }
          // Double-check mount state before updating component state
          if (isMountedRef.current) {
            setTokenUsage(data.tokenUsage || [])
          }
        }
      } catch (error) {
        // Only log errors if component is still mounted
        if (isMountedRef.current) {
          console.error('Failed to fetch token usage:', error)
        }
      } finally {
        // Only update loading state if component is still mounted
        if (isMountedRef.current) {
          setIsLoadingTokenUsage(false)
        }
      }
    }

    fetchTokenUsage()

    // Cleanup function to prevent memory leaks
    return () => {
      isMountedRef.current = false
    }
  }, [jobId])

  // トークン使用量の集計
  const totalTokens = tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0)
  const totalCost = tokenUsage.reduce((sum, usage) => sum + (usage.cost || 0), 0)
  const totalPromptTokens = tokenUsage.reduce((sum, usage) => sum + usage.promptTokens, 0)
  const totalCompletionTokens = tokenUsage.reduce((sum, usage) => sum + usage.completionTokens, 0)

  // プロバイダー別集計
  const providerStats = tokenUsage.reduce(
    (acc, usage) => {
      if (!acc[usage.provider]) {
        acc[usage.provider] = { tokens: 0, cost: 0, count: 0 }
      }
      acc[usage.provider].tokens += usage.totalTokens
      acc[usage.provider].cost += usage.cost || 0
      acc[usage.provider].count += 1
      return acc
    },
    {} as Record<string, { tokens: number; cost: number; count: number }>,
  )

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

      const data = (await response.json()) as { downloadUrl?: string }

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
    // Open preview in new tab (episode page 1)
    const url = `/api/render/${episodeNumber}/1?jobId=${encodeURIComponent(jobId)}`
    window.open(url, '_blank')
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
      {/* ダウンロード導線 */}
      <div className="apple-card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h3 className="text-base font-semibold">エクスポート</h3>
          <p className="text-xs text-gray-500">完了後はここからダウンロードできます</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              const res = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, format: 'pdf' }),
              })
              if (res.ok) {
                const json = (await res.json()) as { downloadUrl?: string }
                if (json.downloadUrl) window.open(json.downloadUrl, '_blank')
              } else {
                alert('PDFエクスポートに失敗しました')
              }
            }}
          >
            PDFダウンロード
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              const res = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, format: 'images_zip' }),
              })
              if (res.ok) {
                const json = (await res.json()) as { downloadUrl?: string }
                if (json.downloadUrl) window.open(json.downloadUrl, '_blank')
              } else {
                alert('ZIPエクスポートに失敗しました')
              }
            }}
          >
            画像ZIPダウンロード
          </button>
        </div>
      </div>

      {/* トークン使用量サマリー */}
      {!isLoadingTokenUsage && tokenUsage.length > 0 && (
        <div className="apple-card p-6">
          <h3 className="text-xl font-semibold gradient-text mb-4">トークン使用量</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-gray-500 text-sm">総トークン数</p>
              <p className="font-bold text-lg">{totalTokens.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm">概算コスト</p>
              <p className="font-bold text-lg">${totalCost.toFixed(4)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm">プロンプト</p>
              <p className="font-bold text-lg">{totalPromptTokens.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm">生成</p>
              <p className="font-bold text-lg">{totalCompletionTokens.toLocaleString()}</p>
            </div>
          </div>

          {/* プロバイダー別詳細 */}
          <div className="mt-4">
            <h4 className="font-medium mb-2">プロバイダー別使用量</h4>
            <div className="space-y-2">
              {Object.entries(providerStats).map(([provider, stats]) => (
                <div key={provider} className="flex justify-between items-center text-sm">
                  <span className="capitalize">{provider}</span>
                  <div className="flex gap-4">
                    <span>{stats.tokens.toLocaleString()} tokens</span>
                    <span>${stats.cost.toFixed(4)}</span>
                    <span>({stats.count} calls)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* エピソード一覧 */}
      <div className="apple-card p-6">
        <h3 className="text-xl font-semibold gradient-text mb-4">エピソード一覧</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {episodes.map((episode) => (
            <button
              key={episode.id}
              type="button"
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors text-left ${
                selectedEpisode?.id === episode.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedEpisode(episode)}
            >
              <div className="font-semibold">Episode {episode.episodeNumber}</div>
              <div className="text-sm text-gray-600">{episode.title}</div>
              <div className="text-sm text-gray-600 mt-1">📄 レイアウト生成済み</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewEpisode(episode.episodeNumber)
                  }}
                  className="btn-secondary text-sm"
                >
                  プレビュー
                </button>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* エクスポート機能 */}
      <div className="apple-card p-6">
        <h3 className="text-xl font-semibold gradient-text mb-4">エクスポート</h3>
        <div className="flex flex-wrap gap-4 items-center">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'images_zip')}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="pdf">PDF</option>
            <option value="images_zip">画像ZIP</option>
          </select>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="btn-primary disabled:opacity-50"
          >
            {isExporting ? 'エクスポート中...' : 'エクスポート'}
          </button>
        </div>
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
              <p className="font-medium">レイアウト生成済み</p>
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
