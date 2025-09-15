import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { SECURITY_CONFIGS, withSecurityEffect } from '@/lib/api-security'
import { requireUser } from '@/server/auth/requireUser'
import { getMypageDashboard } from '@/services/mypage/dashboard-service'

export const GET = withSecurityEffect(SECURITY_CONFIGS.authenticated, (_req: NextRequest) =>
  Effect.gen(function* () {
    const { userId } = yield* requireUser
    return yield* getMypageDashboard(userId)
  }),
)
