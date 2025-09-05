import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderVerticalTextBatch } from '@/services/vertical-text-client'

// 1x1 transparent PNG
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ah1FfUAAAAASUVORK5CYII='

describe('vertical-text-client (batch)', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    process.env.VERTICAL_TEXT_API_URL = 'https://example.com'
    process.env.VERTICAL_TEXT_API_TOKEN = 'token'
    vi.restoreAllMocks()
  })

  it('calls /render/batch with defaults and items', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { image_base64: PNG_1x1_BASE64, width: 1, height: 1, font: 'gothic' },
          { image_base64: PNG_1x1_BASE64, width: 1, height: 1, font: 'mincho' },
        ],
      }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const results = await renderVerticalTextBatch({
      defaults: { fontSize: 20, lineHeight: 1.6, letterSpacing: 0.1, padding: 10 },
      items: [
        { text: 'A', font: 'gothic', maxCharsPerLine: 6 },
        { text: 'B', font: 'mincho', maxCharsPerLine: 8 },
      ],
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/render/batch',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body)
    expect(body.defaults).toMatchObject({
      font_size: 20,
      line_height: 1.6,
      letter_spacing: 0.1,
      padding: 10,
    })
    expect(body.items.length).toBe(2)
    expect(results.length).toBe(2)
    expect(results[0].pngBuffer.length).toBeGreaterThan(0)
  })

  it('throws on non-200', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    globalThis.fetch = mockFetch as unknown as typeof fetch
    await expect(
      renderVerticalTextBatch({ defaults: { fontSize: 20 }, items: [{ text: 'x' }] }),
    ).rejects.toThrow(/vertical-text API failed: .*HTTP 500/)
  })

  it('validates items length (<=50)', async () => {
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof fetch
    const items = Array.from({ length: 51 }, (_, i) => ({ text: `t${i}` }))
    await expect(renderVerticalTextBatch({ defaults: { fontSize: 20 }, items })).rejects.toThrow(
      'items length must be <= 50',
    )
  })
})
