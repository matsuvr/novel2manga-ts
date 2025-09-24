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
 * Job (完全型) から Completion 判定に必要な最小サブセット(JobStatusLite)へ安全に射影するヘルパ。
 * - 直接 unknown 経由の二重キャストを避ける
 * - 余計なフィールドは含めず GC/シリアライズ負荷軽減
 */
export function toJobStatusLite(job: unknown): JobStatusLite | null {
  if (!job || typeof job !== 'object') return null
  const j = job as Record<string, unknown>
  const out: JobStatusLite = {
    status: typeof j.status === 'string' ? j.status : undefined,
    renderCompleted: typeof j.renderCompleted === 'boolean' ? j.renderCompleted : undefined,
    totalPages: typeof j.totalPages === 'number' || j.totalPages === null ? (j.totalPages as number | null) : undefined,
    renderedPages: typeof j.renderedPages === 'number' || j.renderedPages === null ? (j.renderedPages as number | null) : undefined,
  }
  const progress = j.progress
  if (progress && typeof progress === 'object') {
    const per = (progress as { perEpisodePages?: unknown }).perEpisodePages
    if (per && typeof per === 'object') {
      const perEpisodePages: Record<string, { rendered?: number; total?: number }> = {}
      for (const [k, v] of Object.entries(per as Record<string, unknown>)) {
        if (v && typeof v === 'object') {
          const rec = v as Record<string, unknown>
            const rendered = typeof rec.rendered === 'number' ? rec.rendered : undefined
            const total = typeof rec.total === 'number' ? rec.total : undefined
            // total か rendered のどちらか一方でも数値なら登録
            if (rendered !== undefined || total !== undefined) {
              perEpisodePages[k] = { rendered, total }
            }
        }
      }
      if (Object.keys(perEpisodePages).length > 0) {
        out.progress = { perEpisodePages }
      }
    }
  }
  return out
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
