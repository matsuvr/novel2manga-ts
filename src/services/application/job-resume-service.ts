import { getLogger } from '@/infrastructure/logging/logger'
import { AnalyzePipeline } from '@/services/application/analyze-pipeline'
import { db } from '@/services/database/index'
import { extractErrorMessage } from '@/utils/api-error'

export interface ResumeResult {
  success: boolean
  jobId: string
  novelId: string
  status: 'completed' | 'processing' | 'failed'
  resumePoint: string
  message: string
}

export class JobResumeService {
  private readonly logger = getLogger().withContext({ service: 'job-resume' })

  async resumeByNovelId(novelId: string): Promise<ResumeResult> {
    // novelIdが存在するか確認
    const novel = await db.novels().getNovel(novelId)
    if (!novel) {
      throw new Error('指定されたnovelIdが見つかりません')
    }

    // そのnovelIdに関連する最新のジョブを取得
    const jobs = await db.jobs().getJobsByNovelId(novelId)
    if (!jobs || jobs.length === 0) {
      throw new Error('指定されたnovelIdに関連するジョブが見つかりません')
    }

    // データベースで既に作成日時の降順でソートされているため、最初のものが最新
    const latestJob = jobs[0]

    const targetJobId = latestJob.id
    this.logger.info('Resume requested for novelId', { novelId, jobId: targetJobId })

    return await this.resumeJob(targetJobId, novelId)
  }

  private async resumeJob(jobId: string, novelId: string): Promise<ResumeResult> {
    // 現在のジョブ状態を確認
    const currentJob = await db.jobs().getJob(jobId)
    if (!currentJob) {
      throw new Error('ジョブが見つかりません')
    }

    // 既に完了しているジョブの場合
    if (currentJob.status === 'completed') {
      this.logger.info('Job already completed', { jobId })
      return {
        success: true,
        jobId,
        novelId,
        status: 'completed',
        resumePoint: 'none',
        message: 'ジョブは既に完了しています',
      }
    }

    // 失敗したジョブの場合、ステータスをリセット
    if (currentJob.status === 'failed') {
      db.jobs().updateJobStatus(
        jobId,
        'processing',
        'Resume requested - resetting from failed status',
      )
      this.logger.info('Reset failed job status to processing', { jobId })
    }

    // 処理中の場合、現在のステップから継続
    if (currentJob.status === 'processing') {
      this.logger.info('Resuming processing job', {
        jobId,
        currentStep: currentJob.currentStep,
      })
    }

    const resumePoint = currentJob.currentStep || 'unknown'

    // テスト環境では同期実行
    const isTestEnv = process.env.NODE_ENV === 'test'
    if (isTestEnv) {
      const pipeline = new AnalyzePipeline()
      const result = await pipeline.resumeJob(jobId)

      return {
        success: true,
        jobId,
        novelId,
        status: 'completed',
        resumePoint: result.resumePoint,
        message: 'ジョブの再開が完了しました',
      }
    }

    // 本番/開発は非同期で実行
    this.executeResumeAsync(jobId)

    return {
      success: true,
      jobId,
      novelId,
      status: 'processing',
      resumePoint,
      message: 'ジョブの再開を開始しました',
    }
  }

  private async executeResumeAsync(jobId: string): Promise<void> {
    try {
      const pipeline = new AnalyzePipeline()
      await pipeline.resumeJob(jobId)
      this.logger.info('Job resume completed successfully', { jobId })
    } catch (e) {
      this.logger.error('Job resume failed', {
        jobId,
        error: extractErrorMessage(e),
      })
      try {
        const jobs = db.jobs()
        await jobs.updateJobStatus(jobId, 'failed', extractErrorMessage(e))
      } catch {
        // Job status update failed - logged elsewhere
      }
    }
  }
}
