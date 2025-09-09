export type JobStatusLite = {
  status?: string
  renderCompleted?: boolean
  totalPages?: number | null
  renderedPages?: number | null
  // Optional aggregated progress payload (when available via API)
  progress?: {
    perEpisodePages?: Record<
      string,
      {
        // planned: number; // Not strictly required for completion check
        rendered?: number
        total?: number
      }
    >
  }
}

/**
 * 厳密な完了判定: サーバーが完了状態を返しても、ページ数一致を確認してから完了とみなす。
 * ルール:
 * - ステータスが completed/complete であること
 * - totalPages が正数なら renderedPages >= totalPages を必須
 * - totalPages が未確定/0 の場合は perEpisode の合計で rendered==total を確認
 * - 上記が利用できない場合のみ renderCompleted=true を許容
 */
export function isRenderCompletelyDone(job: JobStatusLite | null | undefined): boolean {
  if (!job) return false
  const status = String(job.status || '').toLowerCase()
  const statusCompleted = status === 'completed' || status === 'complete'
  if (!statusCompleted) return false

  const totalPages = Number(job.totalPages || 0)
  const renderedPages = Number(job.renderedPages || 0)

  if (totalPages > 0) {
    return renderedPages >= totalPages
  }

  // Fall back to per-episode aggregation when totals are not set
  const per = job.progress?.perEpisodePages
  if (per && typeof per === 'object' && Object.keys(per).length > 0) {
    let total = 0
    let rendered = 0
    for (const v of Object.values(per)) {
      if (typeof v?.total !== 'number') {
        // totalが未定義のエピソードがある場合、この集計は信頼できないためフォールバック
        return job.renderCompleted === true
      }
      const t = v.total
      const r = typeof v.rendered === 'number' ? v.rendered : 0
      if (t >= 0) {
        total += t
        rendered += r
      } else {
        return job.renderCompleted === true
      }
    }
    return rendered >= total
  }

  // 最後のフォールバック: 明示フラグ
  return job.renderCompleted === true
}
