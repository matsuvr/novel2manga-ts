/**
 * Job Worker Tests (moved)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobWorker } from '../../workers/job-worker'

// Mock dependencies
vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  })),
}))

vi.mock('@/infrastructure/logging/logger', () => ({
  getLogger: vi.fn(() => ({
    withContext: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}))

vi.mock('@/services/notification/service', () => ({
  notificationService: {
    sendJobCompletionNotification: vi.fn(),
  },
}))

describe('JobWorker', () => {
  let worker: JobWorker

  beforeEach(() => {
    worker = new JobWorker({
      tickIntervalMs: 1000,
      maxRetries: 2,
      enableNotifications: false,
      batchSize: 1,
    })
  })

  afterEach(async () => {
    if (worker) {
      await worker.stop()
    }
  })

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultWorker = new JobWorker()
      const status = defaultWorker.getStatus()

      expect(status.config.tickIntervalMs).toBe(5000)
      expect(status.config.maxRetries).toBe(3)
      expect(status.config.enableNotifications).toBe(true)
      expect(status.config.batchSize).toBe(1)
    })
  })
})
