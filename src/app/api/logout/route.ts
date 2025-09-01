import { signOut } from '@/auth'

export async function POST() {
  return signOut()
}
