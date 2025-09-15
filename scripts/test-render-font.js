import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import util from 'node:util'
import { CanvasRenderer } from '../dist/src/lib/canvas/canvas-renderer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection in test script:', util.inspect(reason, { depth: null }))
  process.exit(2)
})
process.on('uncaughtException', (err) => {
  console.error('UncaughtException in test script:', util.inspect(err, { depth: null }))
  process.exit(3)
})

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
    console.error('Render test failed:', util.inspect(err, { depth: null }))
    process.exit(1)
  }
}

main()
