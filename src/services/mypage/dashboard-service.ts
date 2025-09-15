import { Effect } from 'effect'
import { mypageConfig } from '@/config'
import { db } from '@/services/database/database-service-factory'
import type { JobStatus, Novel } from '@/types'
import type { MypageDashboardData, MypageJobSummary, RecentOutputSummary } from '@/types/mypage'
import { ApiError } from '@/utils/api-error'

export function getMypageDashboard(userId: string): Effect.Effect<MypageDashboardData, ApiError> {
  return Effect.gen(function* () {
    const novels = (yield* Effect.tryPromise({
      try: () => db.novels().getAllNovels(userId),
      catch: (error) => new ApiError('Failed to fetch novels', 500, 'DATABASE_ERROR', { error }),
    })) as Novel[]

    const jobs = (yield* Effect.tryPromise({
      try: () => db.jobs().getJobsByUser(userId),
      catch: (error) => new ApiError('Failed to fetch jobs', 500, 'DATABASE_ERROR', { error }),
    })) as { id: string; novelId: string; status: JobStatus }[]

    const outputs = (yield* Effect.tryPromise({
      try: () => db.outputs().getOutputsByUserId(userId, mypageConfig.recentOutputsLimit),
      catch: (error) => new ApiError('Failed to fetch outputs', 500, 'DATABASE_ERROR', { error }),
    })) as RecentOutputSummary[]

    const runningJobs = jobs.filter((j) => j.status === 'processing').length
    const failedJobs = jobs.filter((j) => j.status === 'failed').length

    const jobSummaries: MypageJobSummary[] = jobs.map((j) => {
      const novel = novels.find((n) => n.id === j.novelId)
      return {
        id: j.id,
        novelId: j.novelId,
        novelTitle: novel?.title ?? '',
        status: j.status,
      }
    })

    return {
      novelCount: novels.length,
      runningJobs,
      failedJobs,
      recentOutputs: outputs.map((o) => ({
        id: o.id,
        novelId: o.novelId,
        jobId: o.jobId,
        outputType: o.outputType,
        createdAt: o.createdAt,
      })),
      jobs: jobSummaries,
    }
  })
}
