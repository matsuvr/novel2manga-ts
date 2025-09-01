import { describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/auth', () => ({
  signOut: vi.fn(),
}))

import { signOut } from '@/auth'
import { POST } from '@/app/api/logout/route'

describe('logout route', () => {
  it('calls signOut and returns response', async () => {
    const response = new Response(null, { status: 302 })
    const mockedSignOut = signOut as unknown as Mock
    mockedSignOut.mockResolvedValue(response)
    const res = await POST()
    expect(mockedSignOut).toHaveBeenCalled()
    expect(res).toBe(response)
  })
})
