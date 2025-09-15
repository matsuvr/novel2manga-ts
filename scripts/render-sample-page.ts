import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import util from 'node:util'

// Static imports for type-safety in this script
import { CanvasRenderer } from '../src/lib/canvas/canvas-renderer'
import type { MangaLayout } from '../src/types/panel-layout'

// ...existing code...

async function run() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const outDir = path.resolve(__dirname, 'output')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'sample-page.png')

    // Create a fully-typed MangaLayout matching the zod schema
    const layout: MangaLayout = {
        title: 'Sample Render',
        created_at: new Date().toISOString(),
        episodeNumber: 1,
        pages: [
            {
                page_number: 1,
                panels: [
                    {
                        id: 'panel-1',
                        position: { x: 0.05, y: 0.05 },
                        size: { width: 0.9, height: 0.9 },
                        // dialogues are normally vertical image assets; leave empty to use speech bubble fallback
                        dialogues: [],
                        // SfxPlacer.parseSfxText expects strings. Provide plain strings here.
                        sfx: ['ドカーン（ドン）', 'ズドン！'],
                        content: '階下に住むは、老画家ベーアマン。御年60歳超。\n（テスト用の状況説明テキスト）',
                    },
                ],
            },
        ],
    }

    try {
        // Create renderer (server-side)
        const renderer = await CanvasRenderer.create({ width: 1240, height: 1754 })
        // Render using the strongly-typed MangaLayout
        renderer.renderMangaLayout(layout)
        const blob = await renderer.toBlob('image/png')
        const ab = await blob.arrayBuffer()
        fs.writeFileSync(outPath, Buffer.from(ab))
        console.log('Wrote sample page to', outPath)
        renderer.cleanup()
    } catch (err) {
        console.error('Failed to render sample page:', err)
        process.exit(1)
    }
}

// ESM entry check: tsx/ts-node typically set import.meta.main; fall back to argv check
const meta = import.meta as unknown as { main?: boolean }
const isMain = meta?.main === true || (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('render-sample-page.ts'))
if (isMain) {
    // Top-level error handlers to capture issues inside async initialization (ts-node/ESM can hide Promise reasons)
    process.on('unhandledRejection', (reason) => {
        // eslint-disable-next-line no-console
        console.error('UnhandledRejection in render-sample-page.ts:', util.inspect(reason, { depth: null }))
        process.exit(2)
    })
    process.on('uncaughtException', (err) => {
        // eslint-disable-next-line no-console
        console.error('UncaughtException in render-sample-page.ts:', util.inspect(err, { depth: null }))
        process.exit(3)
    })

    run()
}
