import type { JobStatus } from './job'

export interface MypageJobSummary {
  id: string
  novelId: string
  novelTitle: string
  status: JobStatus
  // ISO string when the job record was created. DB schema provides a default timestamp so this is required.
  createdAt: string
}

export interface RecentOutputSummary {
  id: string
  novelId: string
  jobId: string
  outputType: string
  createdAt: string
}

export interface MypageDashboardData {
  novelCount: number
  runningJobs: number
  failedJobs: number
  recentOutputs: RecentOutputSummary[]
  jobs: MypageJobSummary[]
}
