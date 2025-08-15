import { notFound } from 'next/navigation'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
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

  const db = getDatabaseService()
  const { episode: episodePort, job: jobPort } = adaptAll(db)
  const episodeRepo = new EpisodeRepository(episodePort)
  const jobRepo = new JobRepository(jobPort)

  const job = await jobRepo.getJob(jobId)
  if (!job || job.novelId !== novelId) return notFound()

  const episodes = await episodeRepo.getByJobId(jobId)
  const target = episodes.find((e) => e.episodeNumber === epNum)
  if (!target) return notFound()

  // ページ番号を推定（レイアウトの最大ページ）
  const layoutStorage = await StorageFactory.getLayoutStorage()
  const yamlText = await layoutStorage.get(StorageKeys.episodeLayout(jobId, epNum))
  // データがなければ推定ページ数で 1..estimatedPages を使う
  let pageNumbers: number[] = []
  try {
    if (yamlText?.text) {
      const { load } = await import('js-yaml')
      const parsed = load(yamlText.text) as {
        pages?: Array<{ page_number: number }>
      }
      if (parsed?.pages && Array.isArray(parsed.pages)) {
        pageNumbers = parsed.pages.map((p) => p.page_number).sort((a, b) => a - b)
      }
    }
  } catch (_e) {
    // YAML parse failure can be ignored; fallback to estimated page numbers
  }
  if (pageNumbers.length === 0) {
    const total = Math.max(1, target.estimatedPages || 1)
    pageNumbers = Array.from({ length: total }, (_, i) => i + 1)
  }

  const renderStorage = await StorageFactory.getRenderStorage()
  const images: Array<{ page: number; src: string }> = []
  for (const p of pageNumbers) {
    const key = StorageKeys.pageRender(jobId, epNum, p)
    const file = await renderStorage.get(key)
    if (file?.text) {
      images.push({ page: p, src: `data:image/png;base64,${file.text}` })
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">
        Episode {epNum} プレビュー（{images.length}ページ）
      </h1>
      <div className="space-y-6">
        {images.map((img) => (
          <div key={img.page} className="apple-card p-2">
            <div className="text-sm text-gray-600 mb-1">Page {img.page}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* biome-ignore lint/performance/noImgElement: Using data URI preview; Next/Image is not ideal here */}
            <img src={img.src} alt={`Page ${img.page}`} className="w-full h-auto" />
          </div>
        ))}
        {images.length === 0 && (
          <div className="apple-card p-6 text-center text-gray-600">画像が見つかりませんでした</div>
        )}
      </div>
    </main>
  )
}
