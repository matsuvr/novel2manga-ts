import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import NovelJobResultsClient from '@/components/NovelJobResultsClient'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { loadJobResults } from '@/server/jobs/load-job-results'
import { db } from '@/services/database/index'
import type { Episode } from '@/types/database-models'
import type { JobDto } from '@/types/dto'
import { mapJobToDto } from '@/types/dto'

interface Params {
  novelId: string
  jobId: string
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

export default async function NovelJobResultsPage({ params }: { params: Promise<Params> }) {
  const { novelId, jobId } = await params
  const e2eBypass = process.env.NEXT_PUBLIC_E2E === '1'

  // 先に job を取得（存在確認 & 所有者確認のため）。認証前でも閲覧許可は後で制御。
  const job = await db.jobs().getJob(jobId)
  if (!job || job.novelId !== novelId) {
    return notFound()
  }
  let viewerId: string | null = null
  if (!e2eBypass) {
    const session = await auth()
    viewerId = typeof session?.user?.id === 'string' ? session.user.id : null
    const callbackPath = `/novel/${novelId}/results/${jobId}`
    if (!viewerId) {
      redirect(`/portal/api/auth/login?callbackUrl=${encodeURIComponent(callbackPath)}`)
    }
    if (job.userId && job.userId !== viewerId) {
      redirect('/portal/dashboard')
    }
  }

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

  const {
    normalizedJob: normalizedJobData,
    normalizedEpisodes,
    layoutStatuses,
    coverageWarnings,
    tokenUsageByModel,
    novelPreview,
    jobCompleted,
    renderDone,
    fullPagesPresent,
  } = await loadJobResults(job, novelId)

  if (!fullPagesPresent) {
    if (jobCompleted) {
      return (
        <div className="mx-auto max-w-5xl px-4 py-6" data-testid="results-root" data-job-id={job.id}>
          <h1 className="mb-3 text-2xl font-semibold">処理は完了していますが結果がまだ利用できません</h1>
          <Card>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                ジョブは完了していますが、表示に必要なページデータがまだ生成されていません。
              </div>
              <div className="mt-2 text-sm">しばらく待ってからページを更新するか、進捗ページから再開してください。</div>
              <div className="mt-3 text-xs text-muted-foreground" data-testid="job-id-display">Job ID: {job.id}</div>
              <div className="mt-4">
                <a href={`/novel/${novelId}/progress`} className="underline">
                  進捗ページへ（手動で再開）
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    redirect(`/novel/${novelId}/progress`)
  }

  if (!renderDone) {
    console.warn(`Job ${jobId}: render not strictly marked complete but fullPages present — proceeding to show results.`)
  }

  const normalizedJob: JobDto = normalizedJobData ?? mapJobToDto(job)
  const normalizedEpisodeList: Episode[] = normalizedEpisodes ?? []

  return (
    <NovelJobResultsClient
      novelId={novelId}
      job={normalizedJob}
      layoutStatuses={layoutStatuses}
      coverageWarnings={coverageWarnings}
      uniqueEpisodes={normalizedEpisodeList}
      tokenUsageByModel={tokenUsageByModel}
      novelPreview={novelPreview}
      viewerRole="owner"
      episodeLinkTemplate={`/novel/${novelId}/results/${job.id}/episode/:episodeNumber`}
      downloadUrl={`/api/export/zip/${job.id}`}
    />
  )
}
