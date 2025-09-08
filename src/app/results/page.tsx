import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/services/database/index'

export const dynamic = 'force-dynamic';

export default async function ResultsPage() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    redirect('/api/auth/signin?callbackUrl=/results')
  }
  const jobs = await db.jobs().getJobsByUser(userId)
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">変換結果一覧</h1>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="apple-card p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{job.jobName ?? '無題'}</div>
              <div className="text-sm text-gray-600">{job.createdAt}</div>
            </div>
            <div className="flex items-center gap-4">
              <Link className="btn-secondary text-sm" href={`/results/${job.id}`}>
                詳細
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
