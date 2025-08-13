import { getDatabaseService } from './db-factory'
import { JobNarrativeProcessor } from './job-narrative-processor'
import { getNotificationService } from './notifications'

export interface JobQueueMessage {
  type: 'PROCESS_NARRATIVE'
  jobId: string
  userEmail?: string
}

export interface JobQueue {
  enqueue: (message: JobQueueMessage) => Promise<void>
}

class InProcessQueue implements JobQueue {
  async enqueue(message: JobQueueMessage): Promise<void> {
    // ローカル/開発用の簡易版。即時に非同期で処理を開始
    if (message.type !== 'PROCESS_NARRATIVE') return
    const db = getDatabaseService()
    const processor = new JobNarrativeProcessor(db)
    const notifications = getNotificationService()

    processor
      .processJob(message.jobId, (progress) => {
        // 簡易ロギング（実運用ではイベント配信やDB保存に置換）
        console.log('[Queue] progress', message.jobId, {
          processedChunks: progress.processedChunks,
          totalChunks: progress.totalChunks,
          episodes: progress.episodes.length,
        })
      })
      .then(async () => {
        if (message.userEmail) {
          await notifications.sendJobCompletionEmail(message.userEmail, {
            jobId: message.jobId,
            status: 'completed',
            completedAt: new Date().toISOString(),
          })
        }
      })
      .catch(async (err) => {
        console.error('[Queue] Job processing failed', message.jobId, err)
        // 失敗時はDBステータスをfailedに更新
        try {
          await db.updateJobError(
            message.jobId,
            err instanceof Error ? err.message : String(err),
            'processing',
          )
        } catch (e) {
          console.error('[Queue] Failed to update job error status', e)
        }
        if (message.userEmail) {
          await notifications.sendJobCompletionEmail(message.userEmail, {
            jobId: message.jobId,
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        }
      })
  }
}

let singleton: JobQueue | null = null

export function getJobQueue(): JobQueue {
  // Cloudflare Queues が利用可能ならそちらを使用（雛形）
  const cfQueue = globalThis.JOBS_QUEUE
  if (!singleton) {
    const hasValidCfQueue = Boolean(cfQueue && typeof cfQueue.send === 'function')
    singleton = hasValidCfQueue
      ? {
          async enqueue(message: JobQueueMessage): Promise<void> {
            // Type-safe: send が存在することをチェック済み
            await (cfQueue as NonNullable<typeof cfQueue>).send(message)
          },
        }
      : new InProcessQueue()
  }
  return singleton
}

// test-only: reset singleton for isolated tests
export function __resetJobQueueForTest(): void {
  singleton = null
}
