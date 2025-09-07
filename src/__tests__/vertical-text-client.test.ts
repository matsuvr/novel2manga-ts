import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderVerticalText } from '@/services/vertical-text-client'

// 1x1 transparent PNG
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ah1FfUAAAAASUVORK5CYII='

describe('vertical-text-client', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    process.env.VERTICAL_TEXT_API_URL = 'https://example.com'
    process.env.VERTICAL_TEXT_API_TOKEN = 'token'
    vi.restoreAllMocks()
  })

  it('renders vertical text and returns buffer', async () => {
    // mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image_base64: PNG_1x1_BASE64, width: 1, height: 1 }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch
    const res = await renderVerticalText({ text: 'テスト', fontSize: 20 })
    expect(res.meta.width).toBe(1)
    expect(res.meta.height).toBe(1)
    expect(res.pngBuffer.length).toBeGreaterThan(0)
  })

  it('sends font parameter to API when specified', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image_base64: PNG_1x1_BASE64, width: 1, height: 1 }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    await renderVerticalText({ text: 'ナレーション', font: 'mincho', fontSize: 20 })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/render',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          text: 'ナレーション',
          font: 'mincho',
          font_size: 20,
        }),
      }),
    )
  })

  it('does not send font parameter when not specified (uses default)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image_base64: PNG_1x1_BASE64, width: 1, height: 1 }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    await renderVerticalText({ text: 'セリフ', fontSize: 20 })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/render',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          text: 'セリフ',
          font: undefined,
          font_size: 20,
        }),
      }),
    )
  })

  it('throws on non-200', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    globalThis.fetch = mockFetch as unknown as typeof fetch
    // Implementation now includes method, endpoint and "HTTP 500"; allow any middle text.
    await expect(renderVerticalText({ text: 'x' })).rejects.toThrow(
      /vertical-text API failed: .*HTTP 500/,
    )
  })

  it('throws helpful error when env missing', async () => {
    delete process.env.VERTICAL_TEXT_API_URL
    delete process.env.VERTICAL_TEXT_API_TOKEN
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof fetch
    await expect(renderVerticalText({ text: 'x' })).rejects.toThrow(
      'Vertical text API env not configured',
    )
  })
})
