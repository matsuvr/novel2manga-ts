import { expect, test } from '@playwright/test'

test.describe('API E2E: analyze → layout → render (demo path)', () => {
  test('returns a rendered image for a simple demo flow', async ({ request, baseURL }) => {
    // 1) analyze (demo)
    const analyze = await request.post('/api/analyze?demo=1', {
      data: { text: 'テスト用の短いテキスト', title: 'E2E Demo' },
    })
    expect(analyze.ok(), `analyze failed: ${analyze.status()}`).toBeTruthy()
    const ajson = (await analyze.json()) as { jobId?: string; id?: string }
    const jobId = ajson.jobId || ajson.id
    expect(jobId, 'jobId should be returned from analyze').toBeTruthy()

    // 2) layout (demo)
    const layout = await request.post('/api/layout/generate?demo=1', {
      data: { jobId, episodeNumber: 1 },
    })
    expect(layout.ok(), `layout failed: ${layout.status()} ${await layout.text()}`).toBeTruthy()
    const ljson = (await layout.json()) as { storageKey?: string; layoutPath?: string }
    const storageKey = ljson.storageKey || ljson.layoutPath
    expect(storageKey, 'storageKey should be returned from layout').toBeTruthy()

    // 3) render (demo)
    const render = await request.post('/api/render?demo=1', {
      data: { jobId, episodeNumber: 1, pageNumber: 1 },
    })
    expect(render.ok(), `render failed: ${render.status()} ${await render.text()}`).toBeTruthy()
    const rjson = (await render.json()) as { renderKey?: string }
    expect(rjson.renderKey, 'renderKey should be returned').toBeTruthy()

    // 4) GET image
    const image = await request.get(`/api/render/1/1?jobId=${jobId}`)
    expect(image.ok(), `image get failed: ${image.status()} ${await image.text()}`).toBeTruthy()
    expect(image.headers()['content-type']).toContain('image/png')
    const buf = await image.body()
    expect(buf.byteLength, 'image should not be empty').toBeGreaterThan(0)
  })
})

test.describe('API E2E: analyze → layout → render (fast test path)', () => {
  test('uses demo mode for reliable testing without external dependencies', async ({ request }) => {
    // Note: This test uses demo mode to avoid real LLM calls and ensure fast execution
    // while still testing the full API flow and data structure compatibility.

    // 1) analyze (demo mode for reliable testing)
    const analyze = await request.post('/api/analyze?demo=1', {
      data: { text: '短文', title: 'E2E Minimal' },
    })
    expect(analyze.ok(), `analyze failed: ${analyze.status()} ${await analyze.text()}`).toBeTruthy()
    const ajson = (await analyze.json()) as {
      jobId?: string
      id?: string
      data?: { jobId?: string }
    }
    const jobId = ajson.jobId || ajson.id || ajson.data?.jobId
    expect(jobId, 'jobId should be returned from analyze').toBeTruthy()

    // 2) start episode generation (demo mode for reliable testing)
    const epStart = await request.post(`/api/jobs/${jobId}/episodes?demo=1`, {
      data: { targetPages: 1 },
    })
    expect(
      epStart.ok(),
      `episodes start failed: ${epStart.status()} ${await epStart.text()}`,
    ).toBeTruthy()

    // デモモードではPOSTレスポンスに直接エピソードデータが含まれる
    const epStartJson = (await epStart.json()) as { totalEpisodes?: number; episodes?: unknown[] }
    const totalEpisodes = Number(epStartJson.totalEpisodes || 0)
    expect(totalEpisodes, 'episodes should be generated from POST response').toBeGreaterThan(0)

    // 3) layout (demo mode for reliable testing)
    const layout = await request.post('/api/layout/generate?demo=1', {
      data: { jobId, episodeNumber: 1 },
    })
    expect(layout.ok(), `layout failed: ${layout.status()} ${await layout.text()}`).toBeTruthy()
    const ljson = (await layout.json()) as { storageKey?: string; layoutPath?: string }
    const storageKey = ljson.storageKey || ljson.layoutPath
    expect(storageKey, 'storageKey should be returned from layout').toBeTruthy()

    // 4) render (demo mode for reliable testing)
    const render = await request.post('/api/render?demo=1', {
      data: { jobId, episodeNumber: 1, pageNumber: 1 },
    })
    expect(render.ok(), `render failed: ${render.status()} ${await render.text()}`).toBeTruthy()
    const rjson = (await render.json()) as { renderKey?: string }
    expect(rjson.renderKey, 'renderKey should be returned').toBeTruthy()
  })
})
