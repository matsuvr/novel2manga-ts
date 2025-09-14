import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { mypageConfig } from '@/config'
import { SECURITY_CONFIGS, withSecurityEffect } from '@/lib/api-security'
import { requireUser } from '@/server/auth/requireUser'
import { db } from '@/services/database/database-service-factory'
import { ApiError } from '@/utils/api-error'

export const GET = withSecurityEffect(SECURITY_CONFIGS.authenticated, (_req: NextRequest) =>
  Effect.gen(function* () {
    const { userId } = yield* requireUser

    const novels = yield* Effect.tryPromise({
      try: () => db.novels().getAllNovels(userId),
      catch: (error) => new ApiError('Failed to fetch novels', 500, 'DATABASE_ERROR', { error }),
    })

    const jobs = yield* Effect.tryPromise({
      try: () => db.jobs().getJobsByUser(userId),
      catch: (error) => new ApiError('Failed to fetch jobs', 500, 'DATABASE_ERROR', { error }),
    })

    const outputs = yield* Effect.tryPromise({
      try: () => db.outputs().getOutputsByUserId(userId, mypageConfig.recentOutputsLimit),
      catch: (error) => new ApiError('Failed to fetch outputs', 500, 'DATABASE_ERROR', { error }),
    })

    const runningJobs = jobs.filter((j) => j.status === 'processing').length
    const failedJobs = jobs.filter((j) => j.status === 'failed').length

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
    }
  }),
)
