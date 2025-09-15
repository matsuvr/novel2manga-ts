import fs from 'node:fs'
import path from 'node:path'
// Use relative import to avoid tsconfig path alias resolution when running standalone
import { CanvasRenderer } from '../src/lib/canvas/canvas-renderer'
import type { MangaLayout } from '../src/types/panel-layout'

async function main() {
    try {
        const out = path.resolve(__dirname, 'test-output.png')
        const renderer = await CanvasRenderer.create({ width: 800, height: 1200 })
        // simple layout with one page and one panel (typed)
        const layout: MangaLayout = {
            title: 'Test Render',
            created_at: new Date().toISOString(),
            episodeNumber: 0,
            pages: [
                {
                    page_number: 1,
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

        // Render
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

process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('UnhandledRejection in test script:', reason)
    process.exit(2)
})

main()
