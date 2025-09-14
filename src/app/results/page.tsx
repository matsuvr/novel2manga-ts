import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/services/database/index'

export const dynamic = 'force-dynamic'

export default async function ResultsPage() {
  const session = await auth()
  // Narrow session shape before accessing nested fields to satisfy strict TS checks
  function hasUser(obj: unknown): obj is { user?: { id?: string } } {
    return !!obj && typeof obj === 'object' && 'user' in (obj as Record<string, unknown>)
  }

  const userId = hasUser(session) ? session.user?.id : undefined
  if (!userId) {
    redirect('/portal/api/auth/login?callbackUrl=/results')
  }
  const jobs = await db.jobs().getJobsByUser(userId)
  const jobIds = jobs.map((job) => job.id)
  const tokenTotals = await db.tokenUsage().getTotalsByJobIds(jobIds)
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">変換結果一覧</h1>
      <ul className="space-y-2">
        {jobs.map((job) => {
          const totals = tokenTotals[job.id] ?? { promptTokens: 0, completionTokens: 0 }
          return (
            <li key={job.id} className="apple-card p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{job.jobName ?? '無題'}</div>
                <div className="text-sm text-gray-600">{job.createdAt}</div>
                <div className="text-xs text-gray-600 mt-1">
                  入力 {totals.promptTokens.toLocaleString()}t / 出力{' '}
                  {totals.completionTokens.toLocaleString()}t
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link className="btn-secondary text-sm" href={`/results/${job.id}`}>
                  詳細
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
