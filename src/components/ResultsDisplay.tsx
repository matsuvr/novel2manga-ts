'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eye } from '@/components/icons'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Episode } from '@/types/database-models'
import { groupByProviderModel } from '@/utils/token-usage'

interface TokenUsage {
  agentName: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedContentTokens?: number
  thoughtsTokens?: number
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
  const isMountedRef = useRef(true)

  useEffect(() => {
    const fetchTokenUsage = async () => {
      if (!jobId || !isMountedRef.current) return
      setIsLoadingTokenUsage(true)
      try {
        const response = await fetch(`/api/jobs/${jobId}/token-usage`, { credentials: 'include' })
        if (response.ok) {
          const data = (await response.json()) as { tokenUsage?: TokenUsage[] }
          if (isMountedRef.current) setTokenUsage(data.tokenUsage || [])
        }
      } catch (error) {
        if (isMountedRef.current) console.error('Failed to fetch token usage:', error)
      } finally {
        if (isMountedRef.current) setIsLoadingTokenUsage(false)
      }
    }
    fetchTokenUsage()
    return () => {
      isMountedRef.current = false
    }
  }, [jobId])

  const {
    totalTokens,
    totalCost,
    totalPromptTokens,
    totalCompletionTokens,
    totalCachedTokens,
    totalThoughtsTokens,
  } = useMemo(
    () => ({
      totalTokens: tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0),
      totalCost: tokenUsage.reduce((sum, usage) => sum + (usage.cost || 0), 0),
      totalPromptTokens: tokenUsage.reduce((sum, usage) => sum + usage.promptTokens, 0),
      totalCompletionTokens: tokenUsage.reduce((sum, usage) => sum + usage.completionTokens, 0),
      totalCachedTokens: tokenUsage.reduce(
        (sum, usage) => sum + (usage.cachedContentTokens || 0),
        0,
      ),
      totalThoughtsTokens: tokenUsage.reduce((sum, usage) => sum + (usage.thoughtsTokens || 0), 0),
    }),
    [tokenUsage],
  )

  const modelStats = useMemo(
    () =>
      groupByProviderModel(
        tokenUsage.map((u) => ({
          provider: u.provider,
          model: u.model,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          totalTokens: u.totalTokens,
        })),
      ),
    [tokenUsage],
  )

  const handleExport = async () => {
    if (!jobId) return
    setIsExporting(true)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        credentials: 'include',
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
      if (data.downloadUrl) window.open(data.downloadUrl, '_blank')
    } catch (error) {
      console.error('Export error:', error)
      alert('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  const handleViewEpisode = (episodeNumber: number) => {
    const url = `/api/render/${episodeNumber}/1?jobId=${encodeURIComponent(jobId)}`
    window.open(url, '_blank')
  }

  if (!episodes || episodes.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">
        エピソードが見つかりません
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Export Section */}
      <Card>
        <CardContent>
          <h3 className="mb-2 text-lg font-semibold">エクスポート</h3>
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <div className="min-w-[120px]">
              <label htmlFor="export-format" className="mb-1 block text-xs text-muted-foreground">
                フォーマット
              </label>
              <select
                id="export-format"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'images_zip')}
              >
                <option value="pdf">PDF</option>
                <option value="images_zip">画像ZIP</option>
              </select>
            </div>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting
                ? 'エクスポート中...'
                : `エクスポート (${selectedEpisode ? '選択中のEP' : '全EP'})`}
              {!isExporting && <Download className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Token Usage Section */}
      {isLoadingTokenUsage ? (
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
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
          読み込み中...
        </div>
      ) : (
        tokenUsage.length > 0 && (
          <Card>
            <CardContent>
              <h3 className="mb-2 text-lg font-semibold">トークン使用量</h3>
              <div className="space-y-2">
                <Alert>
                  合計: {totalTokens.toLocaleString()} トークン (入力:{' '}
                  {totalPromptTokens.toLocaleString()}, 出力:{' '}
                  {totalCompletionTokens.toLocaleString()})
                  {totalCost > 0 && ` | 概算コスト: $${totalCost.toFixed(4)}`}
                </Alert>
                {totalCachedTokens > 0 && (
                  <Alert className="border-green-200 bg-green-50 text-green-800">
                    キャッシュ: {totalCachedTokens.toLocaleString()} トークン
                  </Alert>
                )}
                {totalThoughtsTokens > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                    思考: {totalThoughtsTokens.toLocaleString()} トークン
                  </Alert>
                )}
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">モデル</th>
                        <th className="px-3 py-2 text-right font-medium">入力トークン</th>
                        <th className="px-3 py-2 text-right font-medium">出力トークン</th>
                        <th className="px-3 py-2 text-right font-medium">合計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(modelStats).map(([modelKey, stats]) => (
                        <tr key={modelKey} className="border-t">
                          <td className="px-3 py-2">{modelKey}</td>
                          <td className="px-3 py-2 text-right">{stats.prompt.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">
                            {stats.completion.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {(stats.prompt + stats.completion).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* Episode List */}
      <Card>
        <CardContent>
          <h3 className="mb-2 text-lg font-semibold">エピソード一覧</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {episodes.map((episode) => (
              <div key={episode.id}>
                <Card
                  className={`h-full cursor-pointer ${selectedEpisode?.id === episode.id ? 'border-primary' : ''}`}
                  onClick={() => setSelectedEpisode(episode)}
                >
                  <CardContent>
                    <div className="text-base font-semibold">Episode {episode.episodeNumber}</div>
                    <div className="text-sm text-muted-foreground">{episode.title}</div>
                    <div className="mt-2">
                      <Badge variant="outline" className="text-green-700">
                        レイアウト生成済み
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewEpisode(episode.episodeNumber)
                        }}
                      >
                        プレビュー
                        <Eye className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected Episode Details */}
      {selectedEpisode && (
        <Card>
          <CardContent>
            <h3 className="mb-2 text-lg font-semibold">
              {selectedEpisode.title || `エピソード ${selectedEpisode.episodeNumber}`} の詳細
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-muted-foreground">開始位置</div>
                <div className="text-sm">
                  チャンク {selectedEpisode.startChunk} (文字位置: {selectedEpisode.startCharIndex})
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">終了位置</div>
                <div className="text-sm">
                  チャンク {selectedEpisode.endChunk} (文字位置: {selectedEpisode.endCharIndex})
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">信頼度</div>
                <div className="text-sm">{Math.round(selectedEpisode.confidence * 100)}%</div>
              </div>
            </div>
            {selectedEpisode.summary && (
              <div className="mt-2">
                <div className="text-sm font-semibold">あらすじ</div>
                <div className="text-sm text-muted-foreground">{selectedEpisode.summary}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
