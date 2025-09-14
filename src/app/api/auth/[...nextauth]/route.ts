// app/portal/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
import { getMissingAuthEnv } from '@/utils/auth-env'

// Validate required environment variables before initializing NextAuth.
// Throws a descriptive error at startup if any are missing to prevent
// running with an insecure configuration.
const missing = getMissingAuthEnv()
if (missing.length > 0) {
  throw new Error(
    `Cannot initialize NextAuth: Missing required environment variables: ${missing.join(', ')}`,
  )
}

export const { GET, POST } = handlers
