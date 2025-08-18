import { describe, expect, it, vi } from 'vitest'
import type { LoggerPort } from '@/infrastructure/logging/logger'

// Spy logger implementation
class SpyLogger implements LoggerPort {
  public errors: Array<{ msg: string; meta?: Record<string, unknown> }> = []
  public warns: Array<{ msg: string; meta?: Record<string, unknown> }> = []
  public infos: Array<{ msg: string; meta?: Record<string, unknown> }> = []
  public debugs: Array<{ msg: string; meta?: Record<string, unknown> }> = []
  debug(msg: string, meta?: Record<string, unknown>) {
    this.debugs.push({ msg, meta })
  }
  info(msg: string, meta?: Record<string, unknown>) {
    this.infos.push({ msg, meta })
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.warns.push({ msg, meta })
  }
  error(msg: string, meta?: Record<string, unknown>) {
    this.errors.push({ msg, meta })
  }
  withContext(_ctx: Record<string, unknown>) {
    return this
  }
}

describe('Layout Generation Error Boundary (episodes fetch failure)', () => {
  it('logs error with context and rethrows when fetching episodes fails', async () => {
    const spyLogger = new SpyLogger()

    // Mock DB factory so that getEpisodesByJobId throws
    vi.mock('@/services/db-factory', () => ({
      getDatabaseService: () => ({
        // Called via adaptEpisodePort -> EpisodeRepository.getByJobId
        getEpisodesByJobId: async (_jobId: string) => {
          throw new Error('db error: getEpisodesByJobId failed')
        },
        // Called via adaptJobPort in resolveEpisodeData (allowed to be null)
        getJobWithProgress: async (_jobId: string) => null,
      }),
    }))

    // Import after mocks are set
    const { generateEpisodeLayout } = await import('@/services/application/layout-generation')

    const jobId = 'test-job-error'
    const episodeNumber = 1

    await expect(
      // Inject spy logger via dependency parameter to avoid logger mock hoisting issues
      generateEpisodeLayout(jobId, episodeNumber, { isDemo: true }, undefined, spyLogger),
    ).rejects.toThrowError(/getEpisodesByJobId failed/)

    // Verify error log with full context
    const errorEntry = spyLogger.errors.find((e) =>
      e.msg.includes('Failed to retrieve episodes for job'),
    )
    expect(errorEntry).toBeTruthy()
    expect(errorEntry?.meta).toMatchObject({ jobId })
    // stack/message presence
    expect(typeof (errorEntry?.meta as Record<string, unknown>).error).toBe('string')
  })
})
