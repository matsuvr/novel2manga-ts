import { notFound } from 'next/navigation'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'

interface Params {
  novelId: string
  jobId: string
}

export default async function NovelJobResultsPage({ params }: { params: Promise<Params> }) {
  const { novelId, jobId } = await params
  const db = getDatabaseService()
  const { episode: episodePort, job: jobPort } = adaptAll(db)
  const episodeRepo = new EpisodeRepository(episodePort)
  const jobRepo = new JobRepository(jobPort)

  // 指定されたジョブを取得
  const job = await jobRepo.getJob(jobId)
  if (!job || job.novelId !== novelId) return notFound()

  // ジョブが完了していない場合は404
  if (job.status !== 'completed' && job.status !== 'complete') return notFound()

  const episodes = await episodeRepo.getByJobId(job.id)

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
      <div className="apple-card p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">エクスポート</div>
          <div className="text-sm text-gray-600">全エピソードのYAMLとPNGをZIPでダウンロード</div>
        </div>
        <a className="btn-secondary" href={`/api/export/zip/${job.id}`}>
          画像ZIPをダウンロード
        </a>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {episodes.map((e) => (
          <li key={e.id} className="apple-card p-4">
            <div className="font-semibold">Episode {e.episodeNumber}</div>
            <div className="text-sm text-gray-600">{e.title}</div>
            <div className="text-sm text-gray-600 mt-1">📄 レイアウト生成済み</div>
            <div className="mt-2 flex gap-2">
              <a
                href={`/novel/${novelId}/results/${job.id}/episode/${e.episodeNumber}`}
                className="btn-secondary text-sm"
              >
                プレビュー
              </a>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
