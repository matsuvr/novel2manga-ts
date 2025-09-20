import { notFound } from 'next/navigation'
import NovelJobResultsClient from '@/components/NovelJobResultsClient'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { loadJobResults } from '@/server/jobs/load-job-results'
import { db } from '@/services/database'

interface Params {
  token: string
}

function summarizeErrorMessage(msg: string): { summary: string; details?: string } {
  const trimmed = msg.trim()
  const looksLikeHtml = /^<!DOCTYPE html>|<html[\s>/]/i.test(trimmed)
  if (!looksLikeHtml) {
    if (trimmed.length > 500) {
      return { summary: `${trimmed.slice(0, 500)}…`, details: trimmed }
    }
    return { summary: trimmed }
  }
  const firstLine = trimmed.split(/\r?\n/)[0] || 'HTML error response'
  return {
    summary: `外部サービスからHTMLエラーレスポンスを受信しました（概要: ${firstLine.slice(0, 200)}）`,
    details: trimmed,
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SharedJobResultsPage({ params }: { params: Promise<Params> }) {
  const { token } = await params
  const shareRecord = await db.share().getShareByToken(token)
  if (!shareRecord) {
    return notFound()
  }

  const job = await db.jobs().getJob(shareRecord.jobId)
  if (!job) {
    return notFound()
  }

  await db.share().touchAccess(token)

  if (job.status === 'failed') {
    const summarized = job.lastError ? summarizeErrorMessage(job.lastError) : null
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-3 text-2xl font-semibold">このジョブは失敗しました</h1>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Job: {job.id}</div>
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
          </CardContent>
        </Card>
      </div>
    )
  }

  const {
    normalizedJob,
    normalizedEpisodes,
    layoutStatuses,
    coverageWarnings,
    tokenUsageByModel,
    novelPreview,
    jobCompleted,
    renderDone,
    fullPagesPresent,
  } = await loadJobResults(job, job.novelId)

  if (!fullPagesPresent) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-3 text-2xl font-semibold">結果はまだ準備中です</h1>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              ジョブの処理は{jobCompleted ? '完了していますが、レイアウトデータが揃っていません。' : '進行中です。'}
            </div>
            <div className="mt-2 text-sm">
              少し時間をおいて共有リンクを再度開いてください。
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!renderDone) {
    console.warn(`Shared job ${job.id}: render not strictly marked complete but fullPages present — proceeding to show results.`)
  }

  // If the share record restricts to specific episode numbers, filter the collections
  let filteredEpisodes = normalizedEpisodes
  let filteredLayoutStatuses = layoutStatuses
  let filteredCoverageWarnings = coverageWarnings

  if (shareRecord.episodeNumbers && shareRecord.episodeNumbers.length > 0) {
    const allowed = new Set(shareRecord.episodeNumbers.map((n) => Number(n)))
    filteredEpisodes = normalizedEpisodes.filter((ep) => allowed.has(Number(ep.episodeNumber)))
    filteredLayoutStatuses = layoutStatuses.filter((ls) => allowed.has(Number(ls.episodeNumber)))
    filteredCoverageWarnings = coverageWarnings.filter((cw) => {
      if (!cw.episodeNumbers || cw.episodeNumbers.length === 0) return true
      // keep warnings that reference at least one allowed episode
      return cw.episodeNumbers.some((num) => allowed.has(Number(num)))
    })
  }

  return (
    <NovelJobResultsClient
      novelId={job.novelId}
      job={normalizedJob}
      layoutStatuses={filteredLayoutStatuses}
      coverageWarnings={filteredCoverageWarnings}
      uniqueEpisodes={filteredEpisodes}
      tokenUsageByModel={tokenUsageByModel}
      novelPreview={novelPreview}
      viewerRole="shared"
      episodeLinkBuilder={(episodeNumber) => `/share/${token}/episode/${episodeNumber}`}
    />
  )
}
