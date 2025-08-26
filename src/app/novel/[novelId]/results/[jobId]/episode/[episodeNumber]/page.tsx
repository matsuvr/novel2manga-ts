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
  if (!target) {
    // Fallback: layout 存在で許可
    const layoutStorage = await StorageFactory.getLayoutStorage()
    const exists = await layoutStorage.exists(StorageKeys.episodeLayout(jobId, epNum))
    if (!exists) return notFound()
  }

  // ページ番号を推定（レイアウトの最大ページ）
  const layoutStorage = await StorageFactory.getLayoutStorage()
  const layoutText = await layoutStorage.get(StorageKeys.episodeLayout(jobId, epNum))
  // Get page numbers from layout data (JSONのみ)
  let pageNumbers: number[] = []
  try {
    if (layoutText?.text) {
      const parsed = JSON.parse(layoutText.text) as {
        pages?: Array<{ page_number?: number; pageNumber?: number }>
      }
      if (parsed?.pages && Array.isArray(parsed.pages)) {
        pageNumbers = parsed.pages
          .map((p) => (typeof p.page_number === 'number' ? p.page_number : p.pageNumber))
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
          .sort((a, b) => a - b)
      }
    }
  } catch (e) {
    console.error('Failed to parse layout JSON for episode', {
      jobId,
      episodeNumber: epNum,
      error: e instanceof Error ? e.message : String(e),
    })
  }
  // Fallback: If layout did not provide page numbers, enumerate render storage keys
  const renderStorage = await StorageFactory.getRenderStorage()
  if (pageNumbers.length === 0 && typeof renderStorage.list === 'function') {
    try {
      const prefix = `${jobId}/episode_${epNum}/`
      const keys = await renderStorage.list(prefix)
      const nums = keys
        .map((k) => {
          const m = k.match(/episode_\d+\/page_(\d+)\.png$/)
          return m ? Number(m[1]) : undefined
        })
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        .sort((a, b) => a - b)
      pageNumbers = nums
    } catch {
      // ignore
    }
  }

  if (pageNumbers.length === 0) {
    // 最終フォールバック: プレビューは空表示
    pageNumbers = []
  }

  // Load validation info from progress JSON to mark normalized pages
  const layoutProgress = await layoutStorage.get(StorageKeys.episodeLayoutProgress(jobId, epNum))
  let normalizedPages: number[] = []
  let pagesWithIssueCounts: Record<number, number> = {}
  try {
    if (layoutProgress?.text) {
      const parsed = JSON.parse(layoutProgress.text) as {
        validation?: {
          normalizedPages?: number[]
          pagesWithIssueCounts?: Record<number | string, number>
        }
      }
      const np = parsed.validation?.normalizedPages
      if (Array.isArray(np)) {
        normalizedPages = np as number[]
      }
      if (parsed.validation?.pagesWithIssueCounts) {
        const entries = Object.entries(parsed.validation.pagesWithIssueCounts)
        pagesWithIssueCounts = Object.fromEntries(entries.map(([k, v]) => [Number(k), Number(v)]))
      }
    }
  } catch {
    // ignore parse errors
  }
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
        {images.map((img) => {
          const isNormalized = normalizedPages.includes(img.page)
          const issueCount = pagesWithIssueCounts[img.page] || 0
          return (
            <div key={img.page} className="apple-card p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-gray-600">Page {img.page}</div>
                {isNormalized && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Normalized
                    {issueCount > 0 ? ` (${issueCount})` : ''}
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
