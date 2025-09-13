import { Suspense } from 'react'
import { JobDetails } from './JobDetails'

interface JobPageProps {
  params: {
    jobId: string
  }
}

export default function JobPage({ params }: JobPageProps) {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <Suspense fallback={<JobDetailsSkeleton />}>
          <JobDetails jobId={params.jobId} />
        </Suspense>
      </div>
    </div>
  )
}

function JobDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
