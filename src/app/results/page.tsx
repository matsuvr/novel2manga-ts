import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { getDatabaseService } from '@/services/db-factory'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let value = bytes
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(1)}${units[index]}`
}

export default async function ResultsPage() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    redirect('/api/auth/signin?callbackUrl=/results')
  }
  const db = getDatabaseService()
  const jobs = await db.listJobsByUser(userId)
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">変換結果一覧</h1>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="apple-card p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{job.title ?? '無題'}</div>
              <div className="text-sm text-gray-600">{job.createdAt}</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">{formatBytes(job.fileSize)}</div>
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
