import { describe, expect, it, type Mock, vi } from 'vitest'

vi.mock('@/auth', () => ({
  signIn: vi.fn(),
}))

import { GET } from '@/app/api/login/route'
import { signIn } from '@/auth'
import { authConfig } from '@/config/auth.config'

describe('login route', () => {
  it('calls signIn with google and returns response', async () => {
    const response = new Response(null, { status: 302 })
    const mockedSignIn = signIn as unknown as Mock
    mockedSignIn.mockResolvedValue(response)
    const res = await GET()
    expect(mockedSignIn).toHaveBeenCalledWith('google', authConfig.defaultCallbackUrl)
    expect(res).toBe(response)
  })
})
