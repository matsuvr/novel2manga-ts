import { signIn } from '@/auth'
import { authConfig } from '@/config/auth.config'

// Minimal route handler used by tests: call signIn with Google provider and
// default callback URL, return the response.
export async function GET() {
    // pass string callback for test compatibility with older signIn shape
    // @ts-expect-error: legacy signIn overload — tests expect string second arg
    return signIn('google', authConfig.defaultCallbackUrl)
}

export const runtime = 'nodejs'
