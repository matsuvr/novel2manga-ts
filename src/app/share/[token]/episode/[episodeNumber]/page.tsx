import { notFound } from 'next/navigation'
import { loadEpisodePreview } from '@/services/application/episode-preview'
import { db } from '@/services/database'
import { StorageFactory, StorageKeys } from '@/utils/storage'

interface Params {
  token: string
  episodeNumber: string
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SharedEpisodePreviewPage({ params }: { params: Promise<Params> }) {
  const { token, episodeNumber } = await params
  const epNum = Number(episodeNumber)
  if (!epNum || epNum < 1) return notFound()

  const shareRecord = await db.share().getShareByToken(token)
  if (!shareRecord) return notFound()

  const job = await db.jobs().getJob(shareRecord.jobId)
  if (!job) return notFound()

  if (shareRecord.episodeNumbers && shareRecord.episodeNumbers.length > 0) {
    if (!shareRecord.episodeNumbers.includes(epNum)) {
      return notFound()
    }
  }

  await db.share().touchAccess(token)

  const episodes = await db.episodes().getEpisodesByJobId(job.id)
  const target = episodes.find((e) => e.episodeNumber === epNum)
  if (!target) {
    const layoutStorage = await StorageFactory.getLayoutStorage()
    const exists = await layoutStorage.exists(
      StorageKeys.episodeLayout({ novelId: job.novelId, jobId: job.id, episodeNumber: epNum }),
    )
    if (!exists) return notFound()
  }

  const preview = await loadEpisodePreview(job.novelId, job.id, epNum)

  const images: Array<{ page: number; src: string; normalized: boolean; issues: number }> = preview.images.map((img) => ({
    page: img.page,
    src: `data:image/png;base64,${img.base64}`,
    normalized: img.isNormalized,
    issues: img.issueCount,
  }))

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Episode {epNum} プレビュー（{images.length}ページ）</h1>
      <div className="space-y-6">
        {images.map((img) => (
          <div key={img.page} className="apple-card p-2">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm text-gray-600">Page {img.page}</div>
              {img.normalized && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-100 px-2 py-0.5 text-[11px] text-yellow-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> Normalized
                  {img.issues > 0 ? ` (${img.issues})` : ''}
                </span>
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* biome-ignore lint/performance/noImgElement: Using data URI preview; Next/Image is not ideal here */}
            <img src={img.src} alt={`Page ${img.page}`} className="h-auto w-full" />
          </div>
        ))}
        {images.length === 0 && <div className="apple-card p-6 text-center text-gray-600">画像が見つかりませんでした</div>}
      </div>
    </main>
  )
}
