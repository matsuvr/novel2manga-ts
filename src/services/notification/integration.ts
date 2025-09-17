/**
 * Integration utilities for job notification system
 * Provides easy-to-use functions for integrating notifications with existing job processing
 */

import { getLogger } from '@/infrastructure/logging/logger'
import { notificationService } from './service'

/**
 * Send job completion notification
 * This function can be called from anywhere in the job processing pipeline
 * It will handle all the notification logic internally and run in the background
 */
export const sendJobNotification = async (
  jobId: string,
  status: 'completed' | 'failed',
  errorMessage?: string,
): Promise<void> => {
  try {
    await notificationService.sendJobCompletionNotification(jobId, status, errorMessage)
  } catch (error) {
    getLogger()
      .withContext({ service: 'notification-integration' })
      .error('send_job_notification_failed', {
        jobId,
        status,
        error: error instanceof Error ? error.message : String(error),
      })
  }
}

/**
 * Wrapper for existing updateJobStatus calls to include notifications
 * This can be used to replace existing updateJobStatus calls
 */
export const updateJobStatusWithNotification = async (
  updateJobStatusFn: (jobId: string, status: string, error?: string) => Promise<void> | void,
  jobId: string,
  status: string,
  errorMessage?: string,
) => {
  // First update the job status
  await updateJobStatusFn(jobId, status, errorMessage)

  // Then send notification if it's a completion or failure
  if (status === 'completed' || status === 'failed') {
    await sendJobNotification(jobId, status as 'completed' | 'failed', errorMessage)
  }
}
