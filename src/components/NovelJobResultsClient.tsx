'use client'

import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { Episode } from '@/types/database-models'
import type { JobDto } from '@/types/dto'

type ClientJob = JobDto

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
}

export default function NovelJobResultsClient({
  novelId,
  job,
  layoutStatuses,
  coverageWarnings,
  uniqueEpisodes,
}: Props) {
  const layoutStatusMap = new Map(layoutStatuses.map((s) => [s.episodeNumber, s]))
  const processingTimeMs =
    job.completedAt && job.createdAt
      ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()
      : null
  const totalPageCount = layoutStatuses.reduce((sum, status) => sum + (status.totalPages || 0), 0)

  return (
    <div className="container mx-auto max-w-5xl py-6">
      <h1 className="mb-2 text-2xl font-semibold">解析結果（小説ID: {novelId} ）</h1>
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
            </div>
            <div>
              <Button asChild>
                <a href={`/api/export/zip/${job.id}`}>画像ZIPをダウンロード</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                    <Link href={`/novel/${novelId}/results/${job.id}/episode/${e.episodeNumber}`}>
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
