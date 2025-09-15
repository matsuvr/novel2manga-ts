import { Effect } from 'effect'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import MypageJobList from '@/components/mypage-job-list'
import { getMypageDashboard } from '@/services/mypage/dashboard-service'

export const dynamic = 'force-dynamic'

function hasUser(obj: unknown): obj is { user?: { id?: string } } {
  return !!obj && typeof obj === 'object' && 'user' in (obj as Record<string, unknown>)
}

export default async function MypagePage() {
  const session = await auth()
  const userId = hasUser(session) ? session.user?.id : undefined
  if (!userId) {
    redirect('/portal/api/auth/login')
  }
  const dashboard = await Effect.runPromise(getMypageDashboard(userId))
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">マイページ</h1>
      <MypageJobList jobs={dashboard.jobs} />
    </main>
  )
}
