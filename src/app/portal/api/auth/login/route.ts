import { signIn } from '@/auth'

export const GET = () => signIn('google', '/')
