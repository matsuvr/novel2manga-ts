import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RootLayout from '@/app/layout'

vi.mock('@/auth', () => ({ auth: vi.fn() }))

describe('RootLayout authentication env', () => {
  it('renders configuration error when auth env is missing', async () => {
    const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET } = process.env
    try {
      delete process.env.AUTH_GOOGLE_ID
      delete process.env.AUTH_GOOGLE_SECRET
      delete process.env.AUTH_SECRET

      const node = await RootLayout({ children: <div /> })
      render(node)

      expect(
        screen.getByText(/Authentication is not configured\. Missing environment variables:/),
      ).toBeInTheDocument()

      const { auth } = await import('@/auth')
      expect(vi.mocked(auth)).not.toHaveBeenCalled()
    } finally {
      if (AUTH_GOOGLE_ID) process.env.AUTH_GOOGLE_ID = AUTH_GOOGLE_ID
      if (AUTH_GOOGLE_SECRET) process.env.AUTH_GOOGLE_SECRET = AUTH_GOOGLE_SECRET
      if (AUTH_SECRET) process.env.AUTH_SECRET = AUTH_SECRET
    }
  })
})
