// app/portal/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { getAuthOptions } from '@/auth'
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

// In App Router, export the handler reference directly so Next.js supplies
// the correct (req, { params: { nextauth } }) context that NextAuth expects.
const handler = NextAuth(getAuthOptions())
export { handler as GET, handler as POST }
