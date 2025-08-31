import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import ResultsDisplay from '@/components/ResultsDisplay'
import { getDatabaseService } from '@/services/db-factory'

interface Params {
  jobId: string
}

export default async function JobResultsPage({ params }: { params: Promise<Params> }) {
  const { jobId } = await params
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    redirect('/api/auth/signin')
  }
  const db = getDatabaseService()
  const job = await db.getJob(jobId)
  if (!job || job.userId !== userId) return notFound()
  const episodes = await db.getEpisodesByJobId(jobId)
  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">変換結果</h1>
      <ResultsDisplay jobId={jobId} episodes={episodes} />
    </main>
  )
}
