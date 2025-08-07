import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const params = await context.params
    console.log('[job-status] Fetching job status for:', params.jobId)
    const startTime = Date.now()
    
    const dbService = new DatabaseService()
    const job = await dbService.getJobWithProgress(params.jobId)
    
    const duration = Date.now() - startTime
    console.log(`[job-status] Database query completed in ${duration}ms`)
    console.log('[job-status] Job found:', !!job)
    console.log('[job-status] Job details:', job ? { id: job.id, status: job.status } : 'null')

    if (!job) {
      console.log('[job-status] Job not found in database')
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        currentStep: job.currentStep,
        splitCompleted: job.splitCompleted ?? false,
        analyzeCompleted: job.analyzeCompleted ?? false,
        episodeCompleted: job.episodeCompleted ?? false,
        layoutCompleted: job.layoutCompleted ?? false,
        renderCompleted: job.renderCompleted ?? false,
        processedChunks: job.processedChunks ?? 0,
        totalChunks: job.totalChunks ?? 0,
        processedEpisodes: job.processedEpisodes ?? 0,
        totalEpisodes: job.totalEpisodes ?? 0,
        renderedPages: job.renderedPages ?? 0,
        totalPages: job.totalPages ?? 0,
        lastError: job.lastError,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }
    })
  } catch (error) {
    console.error('[job-status] Error fetching job status:', error)
    console.error('[job-status] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    })
    return NextResponse.json({ 
      error: 'Failed to fetch job status',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
