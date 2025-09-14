import { signIn } from '@/auth'
import { authConfig } from '@/config/auth.config'

export const GET = () => signIn('google', authConfig.defaultCallbackUrl)
