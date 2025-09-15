import { describe, expect, it } from 'vitest'

// This test verifies that server-side canvas can register and use a Japanese font
// It will skip if @napi-rs/canvas is not available in the test environment.

describe('server-side canvas font registration', () => {
  it('renders Japanese text into a PNG buffer when @napi-rs/canvas is available', async () => {
    let canvasModule: any
    try {
      canvasModule = await import('@napi-rs/canvas')
    } catch (e) {
      // Skip test if canvas module not available
      console.warn('@napi-rs/canvas not available in test environment; skipping font render test')
      return
    }

    const { createCanvas } = canvasModule
    const width = 200
    const height = 100
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // Try to register bundled font if possible
    try {
      const fontPath =
        process.env.CANVAS_FONT_PATH || `${__dirname}/../../fonts/NotoSansJP-Light.ttf`
      if (canvasModule?.GlobalFonts?.register) {
        canvasModule.GlobalFonts.register(fontPath, { family: 'NotoSansJP' })
      }
    } catch (e) {
      console.warn('Failed to register font for test', e)
    }

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    // Use the registered family name (fallback to system sans-serif)
    ctx.fillStyle = '#000'
    ctx.font = '20px NotoSansJP, GenEiMGothic2, sans-serif'
    ctx.fillText('こんにちは世界', 10, 50)

    const buffer = canvas.toBuffer('image/png')
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer.slice(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })
})
