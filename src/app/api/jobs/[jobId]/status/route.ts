import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import {
  ApiError,
  createErrorResponse,
  toLegacyErrorResponse,
  ValidationError,
} from '@/utils/api-error'

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const params = await ctx.params
    // jobId validation
    if (!params.jobId || params.jobId === 'undefined') {
      throw new ValidationError('Invalid jobId')
    }

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
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
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
      },
    })
  } catch (error) {
    console.error('[job-status] Error fetching job status:', error)
    // Preserve status for known ApiError/ValidationError
    if (error instanceof ApiError || error instanceof ValidationError) {
      return createErrorResponse(error)
    }

    // For unexpected errors, use legacy-compatible response with a normalized message
    // so tests can assert details includes the original cause string
    return toLegacyErrorResponse(error, 'Failed to fetch job status')
  }
}
