import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobDetails } from '@/app/portal/jobs/[jobId]/JobDetails'
import { routesConfig } from '@/config/routes.config'
import { useSession } from 'next-auth/react'

const replaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/portal/jobs/test-job',
}))

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

describe('JobDetails redirects', () => {
  beforeEach(() => {
    replaceMock.mockReset()
  })

  it('redirects unauthenticated users to login with callback', async () => {
    ;(useSession as unknown as vi.Mock).mockReturnValue({ status: 'unauthenticated' })
    render(<JobDetails jobId="test-job" />)
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        '/portal/api/auth/login?callbackUrl=%2Fportal%2Fjobs%2Ftest-job',
      )
    })
  })

  it('redirects to dashboard when job access is forbidden', async () => {
    ;(useSession as unknown as vi.Mock).mockReturnValue({ status: 'authenticated' })
    const originalFetch = global.fetch
    try {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as any
      render(<JobDetails jobId="test-job" />)
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith(routesConfig.portal.dashboard)
      })
    } finally {
      global.fetch = originalFetch
    }
  })
})
