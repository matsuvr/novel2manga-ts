import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import ResultsDisplay from '@/components/ResultsDisplay'
import { db } from '@/services/database/index'
import { isRenderCompletelyDone } from '@/utils/completion'

interface Params {
  jobId: string
}

export default async function JobResultsPage({ params }: { params: Promise<Params> }) {
  const { jobId } = await params
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    redirect('/api/auth/signin')
  }
  const job = await db.jobs().getJob(jobId)
  if (!job) return notFound()
  if (!isRenderCompletelyDone(job as unknown as Parameters<typeof isRenderCompletelyDone>[0])) {
    return notFound()
  }
  const episodes = await db.episodes().getEpisodesByJobId(jobId)

  // Convert string dates to Date objects and handle nulls to match component expectations
  const formattedEpisodes = episodes.map((ep) => ({
    ...ep,
    createdAt: ep.createdAt ? new Date(ep.createdAt) : new Date(),
    title: ep.title || undefined, // Convert null to undefined
    summary: ep.summary || undefined, // Convert null to undefined
  }))

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">変換結果</h1>
      <ResultsDisplay jobId={jobId} episodes={formattedEpisodes} />
    </main>
  )
}
