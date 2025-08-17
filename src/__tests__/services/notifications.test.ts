import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotificationService } from '@/services/notifications'

describe('NotificationService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    delete process.env.NOTIFICATIONS_ENABLED
  })

  it('logs when disabled', async () => {
    const svc = getNotificationService()
    await expect(
      svc.sendJobCompletionEmail('u@example.com', { jobId: 'j', status: 'completed' }),
    ).resolves.toBeUndefined()
  })

  it('logs stub send when enabled', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true'
    const svc = getNotificationService()
    await svc.sendJobCompletionEmail('u@example.com', { jobId: 'j2', status: 'failed' })
    expect(console.log).toHaveBeenCalled()
  })
})
