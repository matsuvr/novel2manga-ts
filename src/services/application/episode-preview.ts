import { getLogger } from '@/infrastructure/logging/logger'
import { StorageFactory, StorageKeys } from '@/utils/storage'

export interface EpisodePagePreview {
  page: number
  base64: string
  isNormalized: boolean
  issueCount: number
}

export interface EpisodePreviewData {
  episodeNumber: number
  totalPages: number
  images: EpisodePagePreview[]
}

/**
 * 指定エピソードの縦スクロールプレビュー用データを読み込む。
 * - レイアウトJSONからページ配列を取得
 * - 進捗JSONから正規化/警告件数を取得
 * - レンダー画像(バイナリ)をBase64で取得
 */
export async function loadEpisodePreview(
  jobId: string,
  episodeNumber: number,
): Promise<EpisodePreviewData> {
  const layoutStorage = await StorageFactory.getLayoutStorage()
  const renderStorage = await StorageFactory.getRenderStorage()

  // ページ番号の取得
  let pageNumbers: number[] = []
  const layoutObj = await layoutStorage.get(StorageKeys.episodeLayout(jobId, episodeNumber))
  if (layoutObj?.text) {
    try {
      const parsed = JSON.parse(layoutObj.text) as {
        pages?: Array<{ page_number?: number; pageNumber?: number }>
      }
      if (parsed.pages && Array.isArray(parsed.pages)) {
        pageNumbers = parsed.pages
          .map((p) => (typeof p.page_number === 'number' ? p.page_number : p.pageNumber))
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
          .sort((a, b) => a - b)
      }
    } catch (error) {
      getLogger()
        .withContext({ service: 'loadEpisodePreview', jobId, episodeNumber })
        .warn('Failed to parse layout JSON', {
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }

  // Fallback: レンダーキー列挙（常にマージして冗長性を確保）
  if (typeof renderStorage.list === 'function') {
    try {
      const prefix = `${jobId}/episode_${episodeNumber}/`
      const keys = await renderStorage.list(prefix)
      // Windows/UNIXのパス区切り差異に対応（\\/ のいずれも許容）
      const fromRenders = keys
        .map((k) => {
          const m = k.match(/episode_\d+[\\/]page_(\d+)\.png$/)
          return m ? Number(m[1]) : undefined
        })
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      // レイアウト由来のページ番号と結合（重複排除）
      const set = new Set<number>([...pageNumbers, ...fromRenders])
      pageNumbers = Array.from(set.values()).sort((a, b) => a - b)
    } catch (error) {
      getLogger()
        .withContext({ service: 'loadEpisodePreview', jobId, episodeNumber })
        .warn('Failed to enumerate render keys', {
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }

  // 進捗（正規化/警告）情報
  let normalizedPages: number[] = []
  let pagesWithIssueCounts: Record<number, number> = {}
  const progressObj = await layoutStorage.get(
    StorageKeys.episodeLayoutProgress(jobId, episodeNumber),
  )
  if (progressObj?.text) {
    try {
      const progress = JSON.parse(progressObj.text) as {
        validation?: {
          normalizedPages?: number[]
          pagesWithIssueCounts?: Record<number | string, number>
        }
      }
      const np = progress.validation?.normalizedPages
      if (Array.isArray(np)) {
        // 数値・文字列混在に頑健化して数値へ正規化
        normalizedPages = np
          .map((v) => (typeof v === 'string' ? Number(v) : v))
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      }
      const iw = progress.validation?.pagesWithIssueCounts
      if (iw && typeof iw === 'object') {
        pagesWithIssueCounts = Object.fromEntries(
          Object.entries(iw).map(([k, v]) => [Number(k), Number(v)]),
        )
      }
    } catch (error) {
      getLogger()
        .withContext({ service: 'loadEpisodePreview', jobId, episodeNumber })
        .warn('Failed to parse progress JSON', {
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }

  // 画像取得
  const images: EpisodePagePreview[] = []
  for (const p of pageNumbers) {
    const key = StorageKeys.pageRender(jobId, episodeNumber, p)
    const file = await renderStorage.get(key)
    // ファイルが存在しない場合でも、ページ情報は返す（UI側で欠落を検知表示できるようにする）
    let base64 = ''
    if (file) {
      // R2/Local両対応：常にBase64へ正規化
      base64 = file.text || ''
      try {
        const normalized = base64.replace(/\s+/g, '')
        const reencoded = Buffer.from(normalized, 'base64').toString('base64')
        const likelyBase64 = reencoded === normalized
        if (!likelyBase64) {
          base64 = Buffer.from(file.text, 'utf-8').toString('base64')
        } else {
          base64 = normalized
        }
      } catch {
        base64 = Buffer.from(file.text, 'utf-8').toString('base64')
      }
      // 追加フォールバック: 何らかの理由で空になった場合、UTF-8として再エンコード
      if (!base64 && typeof file.text === 'string' && file.text.length > 0) {
        base64 = Buffer.from(file.text, 'utf-8').toString('base64')
      }
    }
    images.push({
      page: p,
      base64,
      isNormalized: normalizedPages.includes(p),
      issueCount: pagesWithIssueCounts[p] || 0,
    })
  }

  return {
    episodeNumber,
    // 総ページ数はレイアウトのページ数をソースオブトゥルースとする
    totalPages: pageNumbers.length,
    images,
  }
}
