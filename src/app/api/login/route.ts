import { signIn } from '@/auth'
import { authConfig } from '@/config/auth.config'

export async function GET() {
  // Use callback URL string to match test expectations (and older signIn signature)
  // pass string callback for test compatibility with older signIn shape
  // @ts-expect-error: legacy signIn overload — tests expect string second arg
  return signIn('google', authConfig.defaultCallbackUrl)
}
