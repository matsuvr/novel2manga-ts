import type { Chunk } from '@/db/schema'
import type { LoggerPort } from '@/infrastructure/logging/logger'
import { getChunkRepository } from '@/repositories'
import type { JobStep } from '@/types/job'

/**
 * Interface for step-specific integrity verification
 */
export interface StepIntegrityVerifier {
  /**
   * Verify that DB and storage are synchronized for this step
   */
  verifyIntegrity(
    jobId: string,
    logger: LoggerPort,
    context: StepIntegrityContext,
  ): Promise<StepIntegrityResult>
}

export interface StepIntegrityContext {
  isDemo?: boolean
}

export interface StepIntegrityResult {
  isValid: boolean
  dbItemCount: number
  storageItemCount: number
  errorMessage?: string
  details?: Record<string, unknown>
}

/**
 * Centralized service for verifying DB-Storage synchronization across all pipeline steps
 */
export class StepIntegrityService {
  private readonly verifiers = new Map<JobStep, StepIntegrityVerifier>()

  constructor() {
    this.registerVerifiers()
  }

  /**
   * Register all step-specific verifiers
   */
  private registerVerifiers(): void {
    this.verifiers.set('split', new SplitStepVerifier())
    this.verifiers.set('analyze', new AnalyzeStepVerifier())
    this.verifiers.set('episode', new EpisodeStepVerifier())
    this.verifiers.set('layout', new LayoutStepVerifier())
    this.verifiers.set('render', new RenderStepVerifier())
  }

  /**
   * Verify integrity for a specific step before marking it as completed
   */
  async verifyStepIntegrity(
    jobId: string,
    step: JobStep,
    logger: LoggerPort,
    context: StepIntegrityContext = {},
  ): Promise<StepIntegrityResult> {
    const verifier = this.verifiers.get(step)

    if (!verifier) {
      logger.warn('No integrity verifier registered for step', { jobId, step })
      return {
        isValid: true, // Default to valid for steps without verifiers
        dbItemCount: 0,
        storageItemCount: 0,
        errorMessage: `No verifier implemented for step: ${step}`,
      }
    }

    logger.info('Starting step integrity verification', { jobId, step })
    const result = await verifier.verifyIntegrity(jobId, logger, context)

    if (result.isValid) {
      logger.info('Step integrity verification passed', {
        jobId,
        step,
        dbItems: result.dbItemCount,
        storageItems: result.storageItemCount,
      })
    } else {
      logger.error('Step integrity verification failed', {
        jobId,
        step,
        dbItems: result.dbItemCount,
        storageItems: result.storageItemCount,
        error: result.errorMessage,
        details: result.details,
      })
    }

    return result
  }
}

/**
 * Verifier for split step (chunks)
 */
class SplitStepVerifier implements StepIntegrityVerifier {
  async verifyIntegrity(
    jobId: string,
    logger: LoggerPort,
    context: StepIntegrityContext,
  ): Promise<StepIntegrityResult> {
    try {
      // In demo mode, still verify split step as chunks are created even in demo mode
      if (context.isDemo) {
        logger.info('Running split step integrity verification in demo mode', { jobId })
      }

      // Check DB chunks
      const chunkRepo = getChunkRepository()
      const dbChunks = await chunkRepo.getByJobId(jobId)

      if (dbChunks.length === 0) {
        return {
          isValid: false,
          dbItemCount: 0,
          storageItemCount: 0,
          errorMessage: 'No chunks found in database',
        }
      }

      // Verify storage files exist (sample first few chunks for performance)
      const { StorageFactory } = await import('@/utils/storage')
      const chunkStorage = await StorageFactory.getChunkStorage()

      let storageItemCount = 0
      const sampleSize = Math.min(5, dbChunks.length)

      for (const chunk of (dbChunks as Chunk[]).slice(0, sampleSize)) {
        const storageObj = await chunkStorage.get(chunk.contentPath)
        if (storageObj?.text) {
          storageItemCount++
        }
      }

      if (storageItemCount === 0 && sampleSize > 0) {
        return {
          isValid: false,
          dbItemCount: dbChunks.length,
          storageItemCount: 0,
          errorMessage: 'Chunks exist in DB but not in storage',
          details: { sampledChunks: sampleSize },
        }
      }

      return {
        isValid: true,
        dbItemCount: dbChunks.length,
        storageItemCount: storageItemCount,
      }
    } catch (error) {
      return {
        isValid: false,
        dbItemCount: 0,
        storageItemCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/**
 * Verifier for analyze step (script chunks)
 */
class AnalyzeStepVerifier implements StepIntegrityVerifier {
  async verifyIntegrity(
    jobId: string,
    logger: LoggerPort,
    context: StepIntegrityContext,
  ): Promise<StepIntegrityResult> {
    try {
      // In demo mode, analysis step is skipped, so script chunks won't exist
      if (context.isDemo) {
        logger.info('Skipping analyze step integrity verification in demo mode', { jobId })
        return {
          isValid: true,
          dbItemCount: 0,
          storageItemCount: 0,
          details: { reason: 'Demo mode - analysis step skipped' },
        }
      }

      // Get chunk count from DB
      const chunkRepo = getChunkRepository()
      const dbChunks = await chunkRepo.getByJobId(jobId)

      if (dbChunks.length === 0) {
        return {
          isValid: false,
          dbItemCount: 0,
          storageItemCount: 0,
          errorMessage: 'No chunks found in database for analysis verification',
        }
      }

      // Verify chunk analysis artifacts exist in storage
      const { StorageFactory, StorageKeys } = await import('@/utils/storage')
      const analysisStorage = await StorageFactory.getAnalysisStorage()

      let storageItemCount = 0
      const sampleSize = Math.min(5, dbChunks.length)
      for (let i = 0; i < sampleSize; i++) {
        const analysisKey = StorageKeys.chunkAnalysis(jobId, i)
        const obj = await analysisStorage.get(analysisKey)
        if (obj?.text) {
          storageItemCount++
        }
      }

      if (storageItemCount === 0 && sampleSize > 0) {
        return {
          isValid: false,
          dbItemCount: dbChunks.length,
          storageItemCount: 0,
          errorMessage: 'No chunk analysis files found in storage despite completed analysis',
          details: { sampledChunks: sampleSize },
        }
      }

      return {
        isValid: true,
        dbItemCount: dbChunks.length,
        storageItemCount: storageItemCount,
      }
    } catch (error) {
      return {
        isValid: false,
        dbItemCount: 0,
        storageItemCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/**
 * Verifier for episode step (episodes in DB, combined script in storage)
 */
class EpisodeStepVerifier implements StepIntegrityVerifier {
  async verifyIntegrity(
    jobId: string,
    logger: LoggerPort,
    context: StepIntegrityContext,
  ): Promise<StepIntegrityResult> {
    // TODO: Implement episode step verification (episodes in DB, combined script in storage)
    // For now, skip verification in demo mode
    if (context.isDemo) {
      logger.info('Skipping episode step integrity verification in demo mode', { jobId })
      return {
        isValid: true,
        dbItemCount: 0,
        storageItemCount: 0,
        details: { reason: 'Demo mode - episode step verification skipped' },
      }
    }

    logger.info('Episode step integrity verification not yet implemented', { jobId })
    return { isValid: true, dbItemCount: 0, storageItemCount: 0 }
  }
}

/**
 * Verifier for layout step (layout files in storage, episodes in DB)
 */
class LayoutStepVerifier implements StepIntegrityVerifier {
  async verifyIntegrity(
    jobId: string,
    logger: LoggerPort,
    context: StepIntegrityContext,
  ): Promise<StepIntegrityResult> {
    // TODO: Implement layout step verification (layout files in storage, episodes in DB)
    // For now, skip verification in demo mode
    if (context.isDemo) {
      logger.info('Skipping layout step integrity verification in demo mode', { jobId })
      return {
        isValid: true,
        dbItemCount: 0,
        storageItemCount: 0,
        details: { reason: 'Demo mode - layout step verification skipped' },
      }
    }

    logger.info('Layout step integrity verification not yet implemented', { jobId })
    return { isValid: true, dbItemCount: 0, storageItemCount: 0 }
  }
}

/**
 * Verifier for render step (rendered images in storage)
 */
class RenderStepVerifier implements StepIntegrityVerifier {
  async verifyIntegrity(
    jobId: string,
    logger: LoggerPort,
    context: StepIntegrityContext,
  ): Promise<StepIntegrityResult> {
    // TODO: Implement render step verification (rendered images in storage)
    // For now, skip verification in demo mode
    if (context.isDemo) {
      logger.info('Skipping render step integrity verification in demo mode', { jobId })
      return {
        isValid: true,
        dbItemCount: 0,
        storageItemCount: 0,
        details: { reason: 'Demo mode - render step verification skipped' },
      }
    }

    logger.info('Render step integrity verification not yet implemented', { jobId })
    return { isValid: true, dbItemCount: 0, storageItemCount: 0 }
  }
}
