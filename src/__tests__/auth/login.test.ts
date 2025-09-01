import { describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/auth', () => ({
  signIn: vi.fn(),
}))

import { signIn } from '@/auth'
import { GET } from '@/app/api/login/route'

describe('login route', () => {
  it('calls signIn with google and returns response', async () => {
    const response = new Response(null, { status: 302 })
    const mockedSignIn = signIn as unknown as Mock
    mockedSignIn.mockResolvedValue(response)
    const res = await GET()
    expect(mockedSignIn).toHaveBeenCalledWith('google')
    expect(res).toBe(response)
  })
})
