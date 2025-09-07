// このファイルは非推奨です。後方互換性のためリダイレクトのみを行います。
// 実際の結果ページは /novel/[novelId]/results/[jobId]/page.tsx を使用してください。

import { notFound } from 'next/navigation'
import { db } from '@/services/database/index'

interface Params {
  novelId: string
}

/**
 * @deprecated 削除前のオリジナルコード（バックアップ）
 * このコードは実際には使用されていませんが、参照のために保存しています。
 * 削除日: 2025年9月
 */
export default async function NovelResultsPage_DEPRECATED({ params }: { params: Promise<Params> }) {
  const { novelId } = await params
  // 最新完了ジョブを取得（存在しなければ404）
  const jobs = await db.jobs().getJobsByNovelId(novelId)
  const finished = jobs.filter((j) => j.status === 'completed' || j.status === 'complete')
  const latest = finished.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).pop()
  if (!latest) return notFound()

  const episodes = await db.episodes().getEpisodesByJobId(latest.id)

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        解析結果（小説ID: {novelId} / Job: {latest.id}）
      </h1>
      <div className="apple-card p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">エクスポート</div>
          <div className="text-sm text-gray-600">全エピソードのJSONとPNGをZIPでダウンロード</div>
        </div>
        <a className="btn-secondary" href={`/api/export/zip/${latest.id}`}>
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
                href={`/novel/${novelId}/results/${latest.id}/episode/${e.episodeNumber}`}
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
