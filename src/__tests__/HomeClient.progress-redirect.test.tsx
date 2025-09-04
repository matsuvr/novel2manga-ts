import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomeClient from '@/components/HomeClient'

// Mock next/navigation router
const mockPush = vi.fn().mockResolvedValue(undefined)
vi.mock('next/navigation', async () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

describe('HomeClient redirects to novel progress URL', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('navigates to /novel/:novelId/progress after submit', async () => {
    // UUID v4（3番目のブロック先頭が '4'）
    const novelId = '550e8400-e29b-41d4-a716-446655440000'
    const jobId = 'job-abc'

    // Mock fetch for /api/novel and /api/analyze
    const fetchMock = vi.spyOn(global, 'fetch' as unknown as typeof window.fetch)
    // 1) /api/novel
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uuid: novelId }),
      text: async () => '',
    } as unknown as Response)
    // 2) /api/analyze
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobId }),
      text: async () => '',
    } as unknown as Response)

    render(<HomeClient />)

    // Type some text
    const textarea = await screen.findByPlaceholderText('ここに小説のテキストを入力してください...')
    fireEvent.change(textarea, { target: { value: 'hello world' } })

    // Click submit
    const submit = await screen.findByRole('button', { name: /マンガに変換/ })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith(`/novel/${encodeURIComponent(novelId)}/progress`)
    })
  })
})
