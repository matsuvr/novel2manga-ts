import { signIn } from '@/auth'
import { authConfig } from '@/config/auth.config'

export async function GET() {
  return signIn('google', authConfig.defaultCallbackUrl)
}
