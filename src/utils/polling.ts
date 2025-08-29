export type JobStatusLite = {
  status?: 'pending' | 'processing' | 'completed' | 'complete' | 'failed' | 'paused'
  renderCompleted?: boolean
}

export type PollingNextAction = 'redirect' | 'stop_failed' | 'continue'

const JOB_STATUS_VALUES = [
  'pending',
  'processing',
  'completed',
  'complete',
  'failed',
  'paused',
] as const

export function isJobStatus(value: unknown): value is JobStatusLite['status'] {
  return typeof value === 'string' && (JOB_STATUS_VALUES as readonly string[]).includes(value)
}

/**
 * ジョブ状態と失敗の連続観測回数から、次のポーリング動作を決定する。
 * - 完了: 結果画面への遷移（redirect）
 * - 失敗がしきい値を超過: エラーメッセージ表示のうえ停止（stop_failed）
 * - それ以外: 継続（continue）
 */
export function decideNextPollingAction(
  job: JobStatusLite,
  consecutiveFailed: number,
  failedThreshold = 3,
): PollingNextAction {
  if (job.renderCompleted === true) return 'redirect'
  if (job.status === 'completed' || job.status === 'complete') return 'redirect'

  if (job.status === 'failed') {
    const nextFailed = consecutiveFailed + 1
    if (nextFailed >= failedThreshold) return 'stop_failed'
    return 'continue'
  }

  return 'continue'
}
