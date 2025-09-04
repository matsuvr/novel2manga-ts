import { notFound, redirect } from 'next/navigation'
import { db } from '@/services/database/index'

interface Params {
  novelId: string
  jobId: string
}

export default async function NovelJobResultsPage({ params }: { params: Params }) {
  const { novelId, jobId } = params
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

  if (job.status !== 'completed' && job.status !== 'complete') return notFound()

  const episodes = await db.episodes().getEpisodesByJobId(job.id)

  // レイアウトステータスを取得してページ数情報を含める（責務をLayoutDatabaseServiceへ委譲）
  const layoutStatuses = await db.layout().getLayoutStatusByJobId(job.id)
  const layoutStatusMap = new Map(layoutStatuses.map((s) => [s.episodeNumber, s]))

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
        解析結果（小説ID: {novelId} / Job: {job.id}）
      </h1>
      <div className="apple-card p-4">
        <div className="text-sm text-gray-600">ステータス: {job.status}</div>
        <div className="text-sm text-gray-600">作成日時: {job.createdAt}</div>
        {job.completedAt && (
          <div className="text-sm text-gray-600">完了日時: {job.completedAt}</div>
        )}
      </div>
      {coverageWarnings.length > 0 && (
        <div className="apple-card p-4 border-yellow-200 bg-yellow-50">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠️ カバレッジ警告</h3>
          <div className="text-sm text-yellow-700 mb-3">
            一部のチャンクで小説内容のカバレッジが低くなっています。これらの箇所では内容が欠落している可能性があります。
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
            <li key={e.id} className="apple-card p-4">
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
