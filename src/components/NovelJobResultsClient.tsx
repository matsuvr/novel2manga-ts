'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { Episode } from '@/types/database-models'
import type { JobDto } from '@/types/dto'

type ClientJob = JobDto

type ViewerRole = 'owner' | 'shared'

interface ShareInfo {
  enabled: boolean
  shareUrl?: string
  expiresAt?: string
  episodeNumbers?: number[]
}

interface Props {
  novelId: string
  job: ClientJob
  layoutStatuses: Array<{ episodeNumber: number; totalPages?: number }>
  coverageWarnings: Array<{
    chunkIndex: number
    coverageRatio: number
    message: string
    episodeNumbers?: number[]
  }>
  uniqueEpisodes: Episode[]
  tokenUsageByModel: Array<{
    provider: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }>
  novelPreview?: string
  viewerRole: ViewerRole
  episodeLinkTemplate: string
  downloadUrl?: string
}

export default function NovelJobResultsClient({
  novelId,
  job,
  layoutStatuses,
  coverageWarnings,
  uniqueEpisodes,
  tokenUsageByModel,
  novelPreview,
  viewerRole,
  episodeLinkTemplate,
  downloadUrl,
}: Props) {
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(viewerRole === 'owner' ? null : { enabled: viewerRole === 'shared' })
  const [shareLoading, setShareLoading] = useState(viewerRole === 'owner')
  const [shareError, setShareError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied'>('idle')

  const layoutStatusMap = new Map(layoutStatuses.map((s) => [s.episodeNumber, s]))
  const processingTimeMs =
    job.completedAt && job.createdAt
      ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()
      : null
  const totalPageCount = layoutStatuses.reduce((sum, status) => sum + (status.totalPages || 0), 0)
  const usageList = tokenUsageByModel ?? []

  useEffect(() => {
    if (viewerRole !== 'owner') {
      setShareLoading(false)
      return
    }
    let active = true
    const loadShareStatus = async () => {
      setShareLoading(true)
      try {
        const response = await fetch(`/api/share/${job.id}`, { method: 'GET', cache: 'no-store' })
        const data = (await response.json().catch(() => ({}))) as {
          success?: boolean
          share?: ShareInfo
          error?: string
        }
        if (!active) return
        if (!response.ok || data.success === false) {
          setShareError(data.error ?? '共有設定の取得に失敗しました')
          setShareInfo({ enabled: false })
          return
        }
        setShareInfo(data.share ?? { enabled: false })
        setShareError(null)
      } catch (_error) {
        if (!active) return
        setShareError('共有設定の取得に失敗しました')
        setShareInfo({ enabled: false })
      } finally {
        if (active) {
          setShareLoading(false)
        }
      }
    }
    void loadShareStatus()
    return () => {
      active = false
    }
  }, [job.id, viewerRole])

  const handleShareEnable = useCallback(async () => {
    setShareLoading(true)
    setShareError(null)
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean
        shareUrl?: string
        expiresAt?: string
        episodeNumbers?: number[]
        error?: string
      }
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? '共有リンクの作成に失敗しました')
      }
      setShareInfo({
        enabled: true,
        shareUrl: data.shareUrl,
        expiresAt: data.expiresAt,
        episodeNumbers: data.episodeNumbers,
      })
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '共有リンクの作成に失敗しました')
    } finally {
      setShareLoading(false)
    }
  }, [job.id])

  const handleShareDisable = useCallback(async () => {
    setShareLoading(true)
    setShareError(null)
    try {
      const response = await fetch(`/api/share/${job.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? '共有リンクの無効化に失敗しました')
      }
      setShareInfo({ enabled: false })
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '共有リンクの無効化に失敗しました')
    } finally {
      setShareLoading(false)
    }
  }, [job.id])

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareInfo?.shareUrl) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareInfo.shareUrl)
        setCopyFeedback('copied')
        setTimeout(() => setCopyFeedback('idle'), 2000)
      }
    } catch (_error) {
      setShareError('共有リンクのコピーに失敗しました')
    }
  }, [shareInfo])

  const effectiveShareInfo: ShareInfo = shareInfo ?? { enabled: false }

  const buildEpisodeLink = useCallback(
    (episodeNumber: number) => {
      if (episodeLinkTemplate.includes(':episodeNumber')) {
        return episodeLinkTemplate.replace(':episodeNumber', String(episodeNumber))
      }
      const basePath = episodeLinkTemplate.endsWith('/') ? episodeLinkTemplate : `${episodeLinkTemplate}/`
      return `${basePath}${episodeNumber}`
    },
    [episodeLinkTemplate],
  )

  return (
    <div className="container mx-auto max-w-5xl py-6">
      <h1 className="mb-2 text-2xl font-semibold">
        解析結果（小説ID: {novelId} ）
        {novelPreview && (
          <span className="mt-1 block text-base font-normal text-muted-foreground">
            冒頭: {novelPreview}
          </span>
        )}
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        このページをブックマークすれば、後で直接アクセスできます。
      </p>

      <Card className="mb-4">
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 text-sm">
              <div>ステータス: {job.status}</div>
              <div>作成日時: {new Date(job.createdAt).toISOString()}</div>
              {job.completedAt && <div>完了日時: {new Date(job.completedAt).toISOString()}</div>}
              {processingTimeMs !== null && (
                <div>処理時間: {(processingTimeMs / 1000).toFixed(1)} 秒</div>
              )}
              <div>総ページ数: {totalPageCount} ページ</div>
              {processingTimeMs !== null && (
                <div>
                  1ページあたりの平均所要時間:{' '}
                  {(processingTimeMs / 1000 / Math.max(1, totalPageCount)).toFixed(1)} 秒
                </div>
              )}
              <div>ジョブID: {job.id}</div>
              <div className="pt-2">
                <div className="font-semibold">モデル別トークン消費</div>
                {usageList.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {usageList.map((usage) => (
                      <li
                        key={`${encodeURIComponent(usage.provider)}:${encodeURIComponent(usage.model)}`}
                        className="flex flex-col"
                      >
                        <span className="font-medium capitalize">
                          {usage.provider} / {usage.model}
                        </span>
                        <span className="text-muted-foreground">
                          入力 {usage.promptTokens.toLocaleString()}t / 出力 {usage.completionTokens.toLocaleString()}t (計{' '}
                          {usage.totalTokens.toLocaleString()}t)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-muted-foreground">記録されたトークン消費はありません。</div>
                )}
              </div>
            </div>
            <div>
              {downloadUrl ? (
                <Button asChild>
                  <a href={downloadUrl}>画像ZIPをダウンロード</a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  共有ビューでは画像ZIPのダウンロードは利用できません。
                </p>
              )}
            </div>
          </div>
          {viewerRole === 'owner' && (
            <div className="mt-4 rounded-md border border-dashed p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">共有設定</div>
                  {shareLoading && <div className="text-sm text-muted-foreground">共有設定を読み込み中です…</div>}
                  {!shareLoading && effectiveShareInfo.enabled && (
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="text-muted-foreground">共有リンクが有効です。</div>
                      {effectiveShareInfo.shareUrl && (
                        <div className="break-all rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {effectiveShareInfo.shareUrl}
                        </div>
                      )}
                      {effectiveShareInfo.expiresAt && (
                        <div className="text-xs text-muted-foreground">
                          有効期限: {new Date(effectiveShareInfo.expiresAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                  {!shareLoading && !effectiveShareInfo.enabled && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      共有リンクは無効です。公開する場合は下のボタンから生成してください。
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {effectiveShareInfo.enabled ? (
                    <>
                      <Button variant="outline" size="sm" onClick={handleCopyShareUrl} disabled={!effectiveShareInfo.shareUrl}>
                        {copyFeedback === 'copied' ? 'コピーしました' : 'リンクをコピー'}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={handleShareDisable} disabled={shareLoading}>
                        共有を停止
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={handleShareEnable} disabled={shareLoading}>
                      共有リンクを作成
                    </Button>
                  )}
                </div>
              </div>
              {shareError && <p className="mt-2 text-sm text-destructive">{shareError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {viewerRole === 'shared' && (
        <Alert className="mb-4">
          <AlertTitle>共有リンクで閲覧中</AlertTitle>
          <AlertDescription>
            このページは共有リンク経由で表示されています。ダウンロードなど一部の操作は制限されています。
          </AlertDescription>
        </Alert>
      )}

      {coverageWarnings.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>⚠️ カバレッジ警告</AlertTitle>
          <AlertDescription>
            <p>
              一部のエピソードで原文の内容が十分に反映されていない可能性があります。該当箇所の検討・再生成をご検討ください。
            </p>
            <ul className="mt-2 list-disc pl-5">
              {coverageWarnings.map((warning) => (
                <li
                  key={`warning-${warning.chunkIndex}-${warning.episodeNumbers?.join('-') || 'unknown'}-${warning.coverageRatio}`}
                >
                  • {warning.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-1 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {uniqueEpisodes.map((e) => {
          const layoutStatus = layoutStatusMap.get(e.episodeNumber)
          const pageCount = layoutStatus?.totalPages
          return (
            <Card key={`episode-${e.episodeNumber}`} className="border">
              <CardContent>
                <div className="font-semibold">Episode {e.episodeNumber}</div>
                <div className="text-sm text-muted-foreground">{e.title ?? '（タイトルなし）'}</div>
                <div className="mt-1 text-sm">
                  {pageCount ? `📄 ${pageCount}ページ` : '📄 レイアウト生成済み'}
                </div>
                <div className="mt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildEpisodeLink(e.episodeNumber)}>
                      プレビュー
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
