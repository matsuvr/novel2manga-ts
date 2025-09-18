import { notFound } from 'next/navigation'
import { loadEpisodePreview } from '@/services/application/episode-preview'
import { db } from '@/services/database/index'
import { StorageFactory, StorageKeys } from '@/utils/storage'

interface Params {
  novelId: string
  jobId: string
  episodeNumber: string
}

export default async function EpisodePreviewPage({ params }: { params: Promise<Params> }) {
  const { novelId, jobId, episodeNumber } = await params
  const epNum = Number(episodeNumber)
  if (!epNum || epNum < 1) return notFound()

  const job = await db.jobs().getJob(jobId)
  if (!job || job.novelId !== novelId) return notFound()
  const episodes = await db.episodes().getEpisodesByJobId(jobId)
  const target = episodes.find((e) => e.episodeNumber === epNum)
  if (!target) {
    // Fallback: layout 存在で許可
    const layoutStorage = await StorageFactory.getLayoutStorage()
    const exists = await layoutStorage.exists(
      StorageKeys.episodeLayout({ novelId, jobId, episodeNumber: epNum }),
    )
    if (!exists) return notFound()
  }
  const preview = await loadEpisodePreview(novelId, jobId, epNum)

  const images: Array<{ page: number; src: string; normalized: boolean; issues: number }> =
    preview.images.map((img) => ({
      page: img.page,
      src: `data:image/png;base64,${img.base64}`,
      normalized: img.isNormalized,
      issues: img.issueCount,
    }))

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">
        Episode {epNum} プレビュー（{images.length}ページ）
      </h1>
      <div className="space-y-6">
        {images.map((img) => {
          return (
            <div key={img.page} className="apple-card p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-gray-600">Page {img.page}</div>
                {img.normalized && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Normalized
                    {img.issues > 0 ? ` (${img.issues})` : ''}
                  </span>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* biome-ignore lint/performance/noImgElement: Using data URI preview; Next/Image is not ideal here */}
              <img src={img.src} alt={`Page ${img.page}`} className="w-full h-auto" />
            </div>
          )
        })}
        {images.length === 0 && (
          <div className="apple-card p-6 text-center text-gray-600">画像が見つかりませんでした</div>
        )}
      </div>
    </main>
  )
}
