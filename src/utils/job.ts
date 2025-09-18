import { db } from '@/services/database'

/**
 * Resolve the owning novel ID for a given job.
 * Throws when the job does not exist or is missing a novel association.
 */
export async function getNovelIdForJob(jobId: string): Promise<string> {
  const job = await db.jobs().getJob(jobId)
  if (!job?.novelId) {
    throw new Error(`Novel ID not found for job ${jobId}`)
  }
  return job.novelId
}
