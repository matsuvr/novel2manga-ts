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
    // @ts-expect-error vi
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image_base64: PNG_1x1_BASE64, width: 1, height: 1 }),
    })
    const res = await renderVerticalText({ text: 'テスト', fontSize: 20 })
    expect(res.meta.width).toBe(1)
    expect(res.meta.height).toBe(1)
    expect(res.pngBuffer.length).toBeGreaterThan(0)
  })

  it('throws on non-200', async () => {
    // @ts-expect-error vi
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    await expect(renderVerticalText({ text: 'x' })).rejects.toThrow('vertical-text API failed: 500')
  })

  it('throws helpful error when env missing', async () => {
    delete process.env.VERTICAL_TEXT_API_URL
    delete process.env.VERTICAL_TEXT_API_TOKEN
    // @ts-expect-error vi
    global.fetch = vi.fn()
    await expect(renderVerticalText({ text: 'x' })).rejects.toThrow('Vertical text API env not configured')
  })
})
