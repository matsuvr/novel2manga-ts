import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { StorageFactory } from '@/utils/storage'

export async function GET(_request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const db = await StorageFactory.getDatabase()
    const dbService = new DatabaseService(db)

    const job = await dbService.getExtendedJob(params.jobId)

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      currentStep: job.currentStep,
      progress: job.progress,
      processedChunks: job.processedChunks,
      totalChunks: job.totalChunks || job.chunkCount,
      totalEpisodes: job.totalEpisodes,
      episodeCompleted: job.episodeCompleted,
      lastError: job.lastError,
      lastErrorStep: job.lastErrorStep,
      retryCount: job.retryCount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })
  } catch (error) {
    console.error('Error fetching job status:', error)
    return NextResponse.json({ error: 'Failed to fetch job status' }, { status: 500 })
  }
}
