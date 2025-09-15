const fs = require('node:fs')
const path = require('node:path')
const { CanvasRenderer } = require('../dist/src/lib/canvas/canvas-renderer')

async function main() {
  try {
    const out = path.resolve(__dirname, 'test-output.png')
    const renderer = await CanvasRenderer.create({ width: 800, height: 1200 })
    const layout = {
      pages: [
        {
          panels: [
            {
              id: 'p1',
              position: { x: 0.05, y: 0.05 },
              size: { width: 0.9, height: 0.9 },
              dialogues: [],
              sfx: [],
              content: 'ここに説明文があります。テスト: フォントレンダリング。',
            },
          ],
        },
      ],
    }

    renderer.renderMangaLayout(layout)
    const blob = await renderer.toBlob('image/png')
    const arrayBuffer = await blob.arrayBuffer()
    fs.writeFileSync(out, Buffer.from(arrayBuffer))
    console.log('Wrote test image to', out)
    renderer.cleanup()
  } catch (err) {
    console.error('Render test failed:', err)
    process.exit(1)
  }
}

main()
