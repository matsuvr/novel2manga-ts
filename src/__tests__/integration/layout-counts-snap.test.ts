import { describe, expect, it } from 'vitest'
import { loadSampleTemplatesByCount } from '@/utils/panel-sample-loader'

describe('Layout generation: template loader basic functionality', () => {
  it('loads sample templates for different panel counts', () => {
    // Test that we can load templates for different panel counts
    const templates1 = loadSampleTemplatesByCount(1)
    const templates6 = loadSampleTemplatesByCount(6)

    // Verify template structure
    expect(Array.isArray(templates1)).toBe(true)
    expect(Array.isArray(templates6)).toBe(true)
    expect(templates1.length).toBeGreaterThan(0)
    expect(templates6.length).toBeGreaterThan(0)

    // Verify panel counts match
    for (const template of templates1) {
      expect(template.panels.length).toBe(1)
      expect(template.panelCount).toBe(1)
    }

    for (const template of templates6) {
      expect(template.panels.length).toBe(6)
      expect(template.panelCount).toBe(6)
    }

    // Verify panel structure
    const template1 = templates1[0]
    const template6 = templates6[0]

    expect(template1.panels[0]).toHaveProperty('position')
    expect(template1.panels[0]).toHaveProperty('size')
    expect(template1.panels[0].position).toHaveProperty('x')
    expect(template1.panels[0].position).toHaveProperty('y')
    expect(template1.panels[0].size).toHaveProperty('width')
    expect(template1.panels[0].size).toHaveProperty('height')

    expect(template6.panels[0]).toHaveProperty('position')
    expect(template6.panels[0]).toHaveProperty('size')
  })

  it('generates unique signatures for different templates', () => {
    const templates1 = loadSampleTemplatesByCount(1)
    const templates6 = loadSampleTemplatesByCount(6)

    // Create signature function (same as used in original test)
    const sig = (
      panels: { position: { x: number; y: number }; size: { width: number; height: number } }[],
    ) =>
      panels
        .map((pp) => `${pp.position.x}:${pp.position.y}:${pp.size.width}:${pp.size.height}`)
        .join('|')

    const sigs1 = templates1.map((t) => sig(t.panels))
    const sigs6 = templates6.map((t) => sig(t.panels))

    // All signatures should be strings
    expect(sigs1.every((s) => typeof s === 'string')).toBe(true)
    expect(sigs6.every((s) => typeof s === 'string')).toBe(true)

    // Templates should have different signatures (no duplicates)
    const uniqueSigs1 = new Set(sigs1)
    const uniqueSigs6 = new Set(sigs6)

    expect(uniqueSigs1.size).toBe(sigs1.length)
    expect(uniqueSigs6.size).toBe(sigs6.length)
  })
})
