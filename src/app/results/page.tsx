import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <div className="container mx-auto max-w-5xl py-6">
      <h1 className="mb-4 text-2xl font-semibold">変換結果一覧</h1>

      <Card>
        <CardContent>
          <ul className="divide-y">
            {jobs.map((job) => {
              const totals = tokenTotals[job.id] ?? {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              }
              return (
                <li key={job.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{job.jobName ?? '無題'}</div>
                    <div className="text-xs text-muted-foreground">{job.createdAt}</div>
                    <div className="text-xs text-muted-foreground">
                      入力 {totals.promptTokens.toLocaleString()}t / 出力{' '}
                      {totals.completionTokens.toLocaleString()}t
                    </div>
                  </div>
                  <Button asChild variant="outline" className="ml-4">
                    <Link href={`/novel/${job.novelId}/results/${job.id}`}>詳細</Link>
                  </Button>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
