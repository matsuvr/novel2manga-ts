import { Effect } from 'effect'
import { requireAuth } from './requireAuth'

export interface UserIdentity {
  userId: string
}

export const requireUser = Effect.gen(function* () {
  const user = yield* requireAuth
  return { userId: user.id } satisfies UserIdentity
})
