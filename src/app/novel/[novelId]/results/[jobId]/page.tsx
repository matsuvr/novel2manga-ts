import { notFound, redirect } from 'next/navigation'
import { db } from '@/services/database/index'
import { isRenderCompletelyDone } from '@/utils/completion'
import { StorageFactory, JsonStorageKeys } from '@/utils/storage'
import { EpisodeBreakSchema, type EpisodeBreakPlan } from '@/types/script'

interface Params {
  novelId: string
  jobId: string
}

export default async function NovelJobResultsPage({ params }: { params: Promise<Params> }) {
  const { novelId, jobId } = await params
  // 指定されたジョブを取得
  const job = await db.jobs().getJob(jobId)
  if (!job || job.novelId !== novelId) return notFound()

  // ジョブが完了していない場合は404
  if (job.status === 'failed') {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">処理に失敗しました</h1>
        <div className="apple-card p-4 space-y-2">
          <div className="text-sm text-gray-600">Job: {job.id}</div>
          <div className="text-sm text-gray-600">Status: {job.status}</div>
          {job.lastError && <div className="text-sm text-red-600">Error: {job.lastError}</div>}
          {job.lastErrorStep && (
            <div className="text-sm text-gray-600">Step: {job.lastErrorStep}</div>
          )}
        </div>
      </main>
    )
  }

  if (!isRenderCompletelyDone(job as unknown as Parameters<typeof isRenderCompletelyDone>[0])) {
    return notFound()
  }

  const layoutStorage = await StorageFactory.getLayoutStorage()
  const fullPages = await layoutStorage.get(JsonStorageKeys.fullPages(job.id))
  if (!fullPages) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">処理結果の表示に失敗しました</h1>
        <div className="apple-card p-4 space-y-2">
          <div className="text-sm text-gray-600">Job: {job.id}</div>
          <div className="text-sm text-red-600">
            エラー: 結果ファイル (full_pages.json) が見つかりませんでした。キー:{' '}
            {JsonStorageKeys.fullPages(job.id)}
          </div>
        </div>
      </main>
    )
  }
  let parsedFull: EpisodeBreakPlan
  try {
    parsedFull = EpisodeBreakSchema.parse(JSON.parse(fullPages.text))
  } catch (e) {
    throw new Error(
      `Failed to parse full_pages.json for job ${job.id} (key: ${JsonStorageKeys.fullPages(job.id)}): ${(e as Error).message}`,
    )
  }
  const episodes = parsedFull.episodes

  // レイアウトステータスを取得してページ数情報を含める（責務をLayoutDatabaseServiceへ委譲）
  const layoutStatuses = await db.layout().getLayoutStatusByJobId(job.id)
  const layoutStatusMap = new Map(layoutStatuses.map((s) => [s.episodeNumber, s]))

  // 冗長計算を事前に集約
  const processingTimeMs =
    job.completedAt && job.createdAt
      ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()
      : null
  const totalPageCount = layoutStatuses.reduce((sum, status) => sum + (status.totalPages || 0), 0)

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

  // エピソードが1件のみの場合は、そのプレビューへ自動遷移
  if (episodes.length === 1) {
    const only = episodes[0]
    redirect(`/novel/${novelId}/results/${job.id}/episode/${only.episodeNumber}`)
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        解析結果（小説ID: {novelId} ）<br />
        このページをブックマークすれば、後で直接アクセスできます。
      </h1>
      <div className="apple-card p-4">
        <div className="text-sm text-gray-600">ステータス: {job.status}</div>
        <div className="text-sm text-gray-600">作成日時: {job.createdAt}</div>
        {job.completedAt && (
          <div className="text-sm text-gray-600">完了日時: {job.completedAt}</div>
        )}
        {/* 完了と作成日時の差から、処理時間を表示 */}
        {processingTimeMs !== null && (
          <div className="text-sm text-gray-600">
            処理時間: {(processingTimeMs / 1000).toFixed(1)} 秒
          </div>
        )}
        {/*総ページ数を表示*/}
        <div className="text-sm text-gray-600">総ページ数: {totalPageCount} ページ</div>
        {/*１ページあたりの平均所要時間を表示*/}
        {processingTimeMs !== null && (
          <div className="text-sm text-gray-600">
            1ページあたりの平均所要時間:{' '}
            {(processingTimeMs / 1000 / Math.max(1, totalPageCount)).toFixed(1)} 秒
          </div>
        )}
        <div className="text-sm text-gray-600">ジョブID: {job.id}</div>
      </div>
      {coverageWarnings.length > 0 && (
        <div className="apple-card p-4 border-yellow-200 bg-yellow-50">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠️ カバレッジ警告</h3>
          <div className="text-sm text-yellow-700 mb-3">
            一部のエピソードで原文の内容が十分に反映されていない可能性があります。該当箇所の検討・再生成をご検討ください。
          </div>
          <ul className="space-y-1">
            {coverageWarnings.map((warning) => (
              <li
                key={`warning-${warning.chunkIndex}-${warning.episodeNumbers?.join('-') || 'unknown'}-${warning.coverageRatio}`}
                className="text-sm text-yellow-700"
              >
                • {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="apple-card p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">エクスポート</div>
          <div className="text-sm text-gray-600">全エピソードのJSONとPNGをZIPでダウンロード</div>
        </div>
        <a className="btn-secondary" href={`/api/export/zip/${job.id}`}>
          画像ZIPをダウンロード
        </a>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {episodes.map((e) => {
          const layoutStatus = layoutStatusMap.get(e.episodeNumber)
          const pageCount = layoutStatus?.totalPages

          return (
            <li key={`episode-${e.episodeNumber}`} className="apple-card p-4">
              <div className="font-semibold">Episode {e.episodeNumber}</div>
              <div className="text-sm text-gray-600">{e.title}</div>
              <div className="text-sm text-gray-600 mt-1">
                {pageCount ? `📄 ${pageCount}ページ` : '📄 レイアウト生成済み'}
              </div>
              <div className="mt-2 flex gap-2">
                <a
                  href={`/novel/${novelId}/results/${job.id}/episode/${e.episodeNumber}`}
                  className="btn-secondary text-sm"
                >
                  プレビュー
                </a>
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
