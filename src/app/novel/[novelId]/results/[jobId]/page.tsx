import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/services/database/index'
import type { Episode } from '@/types/database-models'
import { isRenderCompletelyDone } from '@/utils/completion'
import { JsonStorageKeys, StorageFactory } from '@/utils/storage'

interface Params {
  novelId: string
  jobId: string
}

// 外部サービスからのHTMLエラー本文などが入った場合に、概要を整形して表示する
import NovelJobResultsClient from '@/components/NovelJobResultsClient'
import type { JobDto } from '@/types/dto'
import { mapJobToDto } from '@/types/dto'

function summarizeErrorMessage(msg: string): { summary: string; details?: string } {
  const trimmed = msg.trim()
  const looksLikeHtml = /^<!DOCTYPE html>|<html[\s>/]/i.test(trimmed)
  if (!looksLikeHtml) {
    // 長すぎる場合は先頭だけ表示し、詳細は折りたたみ
    if (trimmed.length > 500) {
      return { summary: `${trimmed.slice(0, 500)}…`, details: trimmed }
    }
    return { summary: trimmed }
  }
  // 代表的なHTMLエラーメッセージ（例: Googleの502 HTML）
  const firstLine = trimmed.split(/\r?\n/)[0] || 'HTML error response'
  return {
    summary: `外部サービスからHTMLエラーレスポンスを受信しました（概要: ${firstLine.slice(0, 200)}）`,
    details: trimmed,
  }
}

export default async function NovelJobResultsPage({ params }: { params: Promise<Params> }) {
  const { novelId, jobId } = await params
  // 指定されたジョブを取得
  const job = await db.jobs().getJob(jobId)
  if (!job || job.novelId !== novelId) return notFound()

  // ジョブが完了していない場合は404
  if (job.status === 'failed') {
    const lastError = job.lastError ?? null
    const summarized = lastError ? summarizeErrorMessage(lastError) : null
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-3 text-2xl font-semibold">処理に失敗しました</h1>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Job: {job.id}</div>
            <div className="text-sm text-muted-foreground">Status: {job.status}</div>
            {summarized && (
              <div className="mt-3">
                <Alert variant="destructive">
                  <div className="font-medium">{summarized.summary}</div>
                  {summarized.details && (
                    <details className="mt-2">
                      <summary className="cursor-pointer underline">詳細を表示</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs">
                        {summarized.details}
                      </pre>
                    </details>
                  )}
                </Alert>
              </div>
            )}
            {job.lastErrorStep && <div className="mt-2 text-sm">Step: {job.lastErrorStep}</div>}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isRenderCompletelyDone(job as unknown as Parameters<typeof isRenderCompletelyDone>[0])) {
    return notFound()
  }

  const layoutStorage = await StorageFactory.getLayoutStorage()
  const fullPagesKey = JsonStorageKeys.fullPages(job.id)
  const fullPages = await layoutStorage.get(fullPagesKey)
  if (!fullPages) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-3 text-2xl font-semibold">処理結果の表示に失敗しました</h1>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Job: {job.id}</div>
            <Alert className="mt-2" variant="destructive">
              結果ファイル (full_pages.json) が見つかりませんでした。Storage Key:{' '}
              {JsonStorageKeys.fullPages(job.id)}
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  // レイアウトステータスを取得してページ数情報を含める（責務をLayoutDatabaseServiceへ委譲）
  const layoutStatuses = await db.layout().getLayoutStatusByJobId(job.id)

  // Parse coverage warnings from job if any
  let coverageWarnings: Array<{
    chunkIndex: number
    coverageRatio: number
    message: string
    episodeNumbers?: number[]
  }> = []
  if (job.coverageWarnings) {
    try {
      coverageWarnings = JSON.parse(job.coverageWarnings)
    } catch (e) {
      console.warn('Failed to parse coverage warnings:', e)
    }
  }

  const episodes = await db.episodes().getEpisodesByJobId(job.id)
  // エピソードの結合を考慮して、重複するエピソードをフィルタリング
  const uniqueEpisodes = Array.from(
    episodes
      .reduce((map, episode) => {
        const key = `${episode.startChunk}-${episode.endChunk}`
        if (!map.has(key)) {
          map.set(key, episode)
        }
        return map
      }, new Map<string, (typeof episodes)[0]>())
      .values(),
  )

  // Convert DB job to a client-safe DTO (strings for dates, predictable shapes).
  const normalizedJob: JobDto = mapJobToDto(job)

  const normalizedEpisodes: Episode[] = uniqueEpisodes.map((e) => ({
    ...e,
    title: (e.title as string | null) ?? undefined,
    summary: (e.summary as string | null) ?? undefined,
    createdAt: new Date((e as unknown as { createdAt?: string }).createdAt ?? Date.now()),
  }))

  // Render client component with fetched data to avoid server evaluation of client-only MUI hooks
  return (
    <NovelJobResultsClient
      novelId={novelId}
      job={normalizedJob}
      layoutStatuses={layoutStatuses}
      coverageWarnings={coverageWarnings}
      uniqueEpisodes={normalizedEpisodes}
    />
  )
}
