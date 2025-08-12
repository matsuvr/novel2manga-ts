import { describe, expect, it } from 'vitest'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'
import { runScenario } from '@/services/orchestrator/scenario'

describe('Scenario DSL', () => {
  it('builds and runs the novel-to-manga flow in memory', async () => {
    const scenario = createNovelToMangaScenario()

    // Basic shape assertions
    expect(scenario.id).toBe('novel-to-manga')
    const stepIds = new Set(scenario.steps.map((s) => s.id))
    for (const id of ['ingest', 'chunk', 'analyzeWindow', 'reduce', 'storyboard', 'prompt', 'image', 'compose', 'publish']) {
      expect(stepIds.has(id)).toBe(true)
    }

    // Execute with a small initial input
    const outputs = await runScenario(scenario, {
      initialInput: { novelR2Key: 'novels/example.txt', settings: { windowTokens: 512, strideTokens: 256 } },
    })

    // Ensure key stages produced outputs
    expect(outputs['ingest']).toMatchObject({ manifestKey: expect.any(String), totalChars: expect.any(Number) })
    expect(outputs['chunk']).toMatchObject({ windows: expect.any(Array) })
    // analyzeWindow produces an array of window analyses
    expect(Array.isArray(outputs['analyzeWindow'] as unknown[])).toBe(true)
    expect((outputs['reduce'] as any).scenes?.length).toBeGreaterThan(0)
    expect((outputs['storyboard'] as any).panels?.length).toBeGreaterThan(0)
    expect(Array.isArray(outputs['image'] as unknown[])).toBe(true)
    expect((outputs['compose'] as any).pages?.length).toBeGreaterThan(0)
    expect(outputs['publish']).toMatchObject({ ok: true })
  })
})

